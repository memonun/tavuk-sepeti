/**
 * Cancelling at Aras: the Aras-only cancel ("Aras kaydını iptal et") and the
 * one that runs when an order is cancelled share one path. What matters: our
 * Aras code is cleared only when Aras actually deleted the record, and a
 * parcel the branch already accepted is reported, not silently dropped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { err, ok } from "@/shared/result";
import { ExternalApiError } from "@/shared/errors/app-error";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const logAudit = vi.fn();
vi.mock("@/shared/audit/log-audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const env = {
  ARAS_SETORDER_USERNAME: "user" as string | undefined,
  ARAS_SETORDER_PASSWORD: "pass",
  ARAS_TEST_MODE: "0",
  ARAS_TRACKING_ACCOUNT_ID: undefined,
};
vi.mock("@/shared/env", () => ({ env }));

const cancelArasDispatch = vi.fn();
vi.mock("@/features/cargo/infrastructure/aras-client", () => ({
  cancelArasDispatch: (...a: unknown[]) => cancelArasDispatch(...a),
  sendArasOrder: vi.fn(),
}));

const findArasIntegrationCode = vi.fn();
const clearArasShipment = vi.fn();
vi.mock("@/features/cargo/infrastructure/aras-shipment.repository", () => ({
  findArasIntegrationCode: (...a: unknown[]) => findArasIntegrationCode(...a),
  clearArasShipment: (...a: unknown[]) => clearArasShipment(...a),
  fetchArasShipmentSource: vi.fn(),
  markOrderSentToAras: vi.fn(),
}));

const { cancelArasShipmentAs, cancelArasShipmentIfSent } = await import(
  "@/features/cargo/application/aras"
);

const ORDER = "4f1c2b9e-8a7d-4c3b-9e2f-1a2b3c4d5e6f";
const actor = { id: "admin-1" };
const arasReplies = (resultCode: string, resultMessage = "") =>
  cancelArasDispatch.mockResolvedValue(ok({ resultCode, resultMessage }));

beforeEach(() => {
  vi.clearAllMocks();
  env.ARAS_SETORDER_USERNAME = "user";
  findArasIntegrationCode.mockResolvedValue(ok("26110101007"));
  clearArasShipment.mockResolvedValue(ok(undefined));
});

describe("cancelArasShipmentAs", () => {
  it("deletes the record at Aras, clears our code and audits it", async () => {
    arasReplies("0", "Başarılı");

    expect(await cancelArasShipmentAs(actor, ORDER)).toEqual(ok(undefined));
    expect(cancelArasDispatch).toHaveBeenCalledWith(
      { username: "user", password: "pass", testMode: false },
      "26110101007",
    );
    expect(clearArasShipment).toHaveBeenCalledWith(ORDER);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order.aras_cancelled",
        entity_id: ORDER,
        after: { aras_integration_code: "26110101007", outcome: "cancelled" },
      }),
    );
  });

  it("treats 'record not found' at Aras as done, so a retry succeeds", async () => {
    arasReplies("-1", "Kayıt bulunamadı");

    expect((await cancelArasShipmentAs(actor, ORDER)).ok).toBe(true);
    expect(clearArasShipment).toHaveBeenCalledWith(ORDER);
  });

  it("keeps our code when the branch already accepted the parcel", async () => {
    arasReplies("999");

    const result = await cancelArasShipmentAs(actor, ORDER);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("kabul etmiş");
    expect(clearArasShipment).not.toHaveBeenCalled();
  });

  it("keeps our code when Aras can't be reached", async () => {
    cancelArasDispatch.mockResolvedValue(
      err(new ExternalApiError({ message: "Aras Kargo'ya bağlanılamadı." })),
    );

    const result = await cancelArasShipmentAs(actor, ORDER);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("bağlanılamadı");
    expect(clearArasShipment).not.toHaveBeenCalled();
  });

  it("refuses an order that was never sent to Aras", async () => {
    findArasIntegrationCode.mockResolvedValue(ok(null));

    expect((await cancelArasShipmentAs(actor, ORDER)).ok).toBe(false);
    expect(cancelArasDispatch).not.toHaveBeenCalled();
  });

  it("refuses when the Aras credentials aren't configured", async () => {
    env.ARAS_SETORDER_USERNAME = undefined;

    expect((await cancelArasShipmentAs(actor, ORDER)).ok).toBe(false);
    expect(cancelArasDispatch).not.toHaveBeenCalled();
  });
});

describe("cancelArasShipmentIfSent (order cancelled)", () => {
  it("deletes the record at Aras and clears our code", async () => {
    arasReplies("0");

    await cancelArasShipmentIfSent(actor, ORDER);

    expect(clearArasShipment).toHaveBeenCalledWith(ORDER);
  });

  it("does nothing for an order never sent to Aras", async () => {
    findArasIntegrationCode.mockResolvedValue(ok(null));

    await cancelArasShipmentIfSent(actor, ORDER);

    expect(cancelArasDispatch).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
