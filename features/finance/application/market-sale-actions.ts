"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  createMarketSaleSchema,
  deleteMarketSaleSchema,
  updateMarketSaleSchema,
} from "@/features/finance/domain/market-sale.schema";
import {
  createMarketSale,
  deleteMarketSale,
  findMarketSaleById,
  updateMarketSale,
} from "@/features/finance/infrastructure/market-sale.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { MarketSale } from "@/features/finance/domain/market-sale";

const PAZAR_PATH = "/finans/pazar-satislari";
const FINANS_PATH = "/finans";

/** Client-callable fetch for the edit dialog — a plain `server-only` read
 *  function can't be imported into a Client Component (Next.js build
 *  error); this needs "use server" like the rest of this file's actions,
 *  same reasoning as features/orders/application/payments.ts's
 *  getOrderPaymentsAction. */
export async function getMarketSaleDetailAction(
  id: string,
): Promise<Result<MarketSale, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  return findMarketSaleById(id);
}

export async function createMarketSaleAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createMarketSaleSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz pazar satışı.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const created = await createMarketSale({ ...parsed.data, created_by: auth.value.id });
  if (!created.ok) return err(created.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "market_sale.created",
    entity_type: "market_sale",
    entity_id: created.value,
    after: {
      location_id: parsed.data.location_id,
      sale_date: parsed.data.sale_date,
      total_amount_minor: parsed.data.total_amount_minor,
    },
  });

  revalidatePath(PAZAR_PATH);
  revalidatePath(FINANS_PATH);
  return ok({ id: created.value });
}

export async function updateMarketSaleAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateMarketSaleSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz pazar satışı.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { id, ...rest } = parsed.data;

  const updated = await updateMarketSale(id, rest);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "market_sale.updated",
    entity_type: "market_sale",
    entity_id: id,
    after: { total_amount_minor: rest.total_amount_minor },
  });

  revalidatePath(PAZAR_PATH);
  revalidatePath(FINANS_PATH);
  return ok({ id });
}

export async function deleteMarketSaleAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = deleteMarketSaleSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz pazar satışı." }));
  }

  const deleted = await deleteMarketSale(parsed.data.id);
  if (!deleted.ok) return err(deleted.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "market_sale.deleted",
    entity_type: "market_sale",
    entity_id: parsed.data.id,
  });

  revalidatePath(PAZAR_PATH);
  revalidatePath(FINANS_PATH);
  return ok({ id: parsed.data.id });
}
