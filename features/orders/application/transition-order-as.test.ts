/**
 * transitionOrderAs is shared by the panel Server Action and the MCP connector.
 * What matters: the actor passed in is the one persisted + audited (never an
 * ambient session), the state machine still gates every change, and nothing is
 * written when it refuses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/shared/result";

import type { Order } from "@/features/orders/domain/order";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const logAudit = vi.fn();
vi.mock("@/shared/audit/log-audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const findOrderById = vi.fn();
const persistTransition = vi.fn();
vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  findOrderById: (...a: unknown[]) => findOrderById(...a),
  persistTransition: (...a: unknown[]) => persistTransition(...a),
}));

const { transitionOrderAs } = await import("@/features/orders/application/transition-order-as");

const ID = "4f1c2b9e-8a7d-4c3b-9e2f-1a2b3c4d5e6f";
const order = (status: Order["status"]) => ({ id: ID, status }) as Order;

describe("transitionOrderAs", () => {
  beforeEach(() => {
    findOrderById.mockReset();
    persistTransition.mockReset();
    logAudit.mockReset();
  });

  it("persists and audits under the explicit actor, tagging the source", async () => {
    findOrderById.mockResolvedValue(ok(order("pending")));
    persistTransition.mockResolvedValue(ok(undefined));

    const result = await transitionOrderAs(
      { id: "admin-7" },
      { order_id: ID, to_status: "confirmed" },
      { source: "mcp" },
    );

    expect(result).toEqual({
      status: "success",
      orderId: ID,
      fromStatus: "pending",
      toStatus: "confirmed",
    });
    expect(persistTransition).toHaveBeenCalledWith({
      order_id: ID,
      to_status: "confirmed",
      reason: null,
      actor_id: "admin-7",
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "admin-7",
        action: "order.transitioned",
        before: { status: "pending" },
        after: { status: "confirmed" },
        metadata: { source: "mcp" },
      }),
    );
  });

  it("refuses an invalid transition without writing anything", async () => {
    findOrderById.mockResolvedValue(ok(order("delivered")));

    const result = await transitionOrderAs(
      { id: "admin-7" },
      { order_id: ID, to_status: "pending" },
    );

    expect(result.status).toBe("error");
    expect(persistTransition).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("requires a reason to cancel", async () => {
    findOrderById.mockResolvedValue(ok(order("confirmed")));

    const result = await transitionOrderAs(
      { id: "admin-7" },
      { order_id: ID, to_status: "cancelled", reason: "   " },
    );

    expect(result.status).toBe("error");
    expect(persistTransition).not.toHaveBeenCalled();
  });
});
