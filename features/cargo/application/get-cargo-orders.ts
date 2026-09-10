import "server-only";

/**
 * The cargo prep queue: every confirmed shipping-channel order (not yet
 * marked "shipped"), oldest first, plus the aggregated product manifest for
 * what needs to be packed. No date scope — cargo isn't a daily van route,
 * the carrier picks up on its own schedule, so this is one running queue
 * rather than a day-by-day view like /routes.
 */
import { computeCargoManifest } from "@/features/cargo/domain/cargo-manifest";
import { fetchCargoOrderItems } from "@/features/cargo/infrastructure/cargo-order-items.repository";
import { fetchCargoRecipients } from "@/features/cargo/infrastructure/cargo-recipients.repository";
import { listOrders } from "@/features/orders/application/list-orders";
import { AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { CargoManifest } from "@/features/cargo/domain/cargo-manifest";
import type { CargoRecipient } from "@/features/cargo/domain/cargo-recipient";
import type { OrderListItem } from "@/features/orders/application/list-orders";

export interface CargoQueueResult {
  orders: OrderListItem[];
  manifest: CargoManifest;
  /** Per-order recipient card data, keyed by order id. Plain object (not a
   *  Map) so it crosses the Server→Client component boundary as a prop. */
  recipients: Record<string, CargoRecipient>;
}

/** Bounded cap for one unpaginated queue fetch — application/ may not import
 *  another feature's domain/ (eslint-plugin-boundaries), so this doesn't
 *  reuse orders' GRID_PAGE_SIZE constant; it's the same value for the same
 *  reason (a real cargo backlog stays far below this either way). */
const CARGO_QUEUE_PAGE_SIZE = 2000;

export async function getCargoOrders(): Promise<Result<CargoQueueResult, AppError>> {
  const ordersResult = await listOrders({
    fulfillment_channel: "shipping",
    status: "confirmed",
    sort: "created_at",
    order: "asc",
    page: 1,
    pageSize: CARGO_QUEUE_PAGE_SIZE,
  });
  if (!ordersResult.ok) return err(ordersResult.error);

  const orders = ordersResult.value.items;
  const orderIds = orders.map((o) => o.id);
  const [itemsByOrder, recipientsByOrder] = await Promise.all([
    fetchCargoOrderItems(orderIds),
    fetchCargoRecipients(orderIds),
  ]);

  const manifest = computeCargoManifest(
    orders.map((order) => ({
      order_id: order.id,
      total_minor: order.total_minor,
      items: itemsByOrder.get(order.id) ?? [],
    })),
  );

  return ok({
    orders,
    manifest,
    recipients: Object.fromEntries(recipientsByOrder),
  });
}
