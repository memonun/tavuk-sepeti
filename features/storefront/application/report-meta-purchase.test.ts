/**
 * Server-side Meta Purchase: what is captured at checkout, and when a sale is
 * (and is not) sent. Follows the repo's mock-then-`await import()` pattern.
 */
import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://apuhanciftligi.com" } }));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let requestHeaders = new Headers();
let requestCookies = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({
    get: (name: string) => (requestCookies.has(name) ? { name, value: requestCookies.get(name) } : undefined),
  }),
}));

const isMetaConversionsEnabled = vi.fn();
const sendMetaServerEvent = vi.fn();
vi.mock("@/features/storefront/infrastructure/meta-conversions.client", () => ({
  isMetaConversionsEnabled: () => isMetaConversionsEnabled(),
  sendMetaServerEvent: (...a: unknown[]) => sendMetaServerEvent(...a),
}));

const saveOrderAdSignals = vi.fn();
const readPendingPurchaseReport = vi.fn();
const deleteOrderAdSignals = vi.fn();
vi.mock("@/features/storefront/infrastructure/order-ad-signals.repository", () => ({
  saveOrderAdSignals: (...a: unknown[]) => saveOrderAdSignals(...a),
  readPendingPurchaseReport: (...a: unknown[]) => readPendingPurchaseReport(...a),
  deleteOrderAdSignals: (...a: unknown[]) => deleteOrderAdSignals(...a),
}));

const { captureOrderAdSignals, reportPurchaseToMeta } = await import(
  "@/features/storefront/application/report-meta-purchase"
);

const ORDER_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

const PENDING = {
  purchase: { orderNumber: "261108-K-01050", totalMinor: 50_000, items: [{ productKey: "yumurta-30", quantity: 1 }] },
  signals: { emailHash: "a".repeat(64), phoneHash: null, fbp: "fb.1.1730000000000.1", fbc: null, clientIp: "88.230.1.2", userAgent: "UA" },
  capturedAtMs: Date.now(),
};

beforeEach(() => {
  vi.clearAllMocks();
  requestHeaders = new Headers();
  requestCookies = new Map();
  isMetaConversionsEnabled.mockReturnValue(true);
  saveOrderAdSignals.mockResolvedValue({ ok: true, value: undefined });
  readPendingPurchaseReport.mockResolvedValue({ ok: true, value: PENDING });
  sendMetaServerEvent.mockResolvedValue({ ok: true, value: "sent" });
});

describe("captureOrderAdSignals", () => {
  it("stores only hashes of e-mail/phone, plus Meta cookies, IP and user agent", async () => {
    requestHeaders = new Headers({
      "x-forwarded-for": "88.230.1.2, 10.0.0.1",
      "user-agent": "Mozilla/5.0",
    });
    requestCookies = new Map([
      ["_fbp", "fb.1.1730000000000.111"],
      ["_fbc", "fb.1.1730000000000.IwAR"],
    ]);

    await captureOrderAdSignals({ orderId: ORDER_ID, email: "Ayse@Example.com", phone: "0532 123 45 67" });

    expect(saveOrderAdSignals).toHaveBeenCalledWith(ORDER_ID, {
      emailHash: sha("ayse@example.com"),
      phoneHash: sha("905321234567"),
      fbp: "fb.1.1730000000000.111",
      fbc: "fb.1.1730000000000.IwAR",
      clientIp: "88.230.1.2",
      userAgent: "Mozilla/5.0",
    });
  });

  it("captures nothing when the browser sends Global Privacy Control", async () => {
    requestHeaders = new Headers({ "sec-gpc": "1" });
    await captureOrderAdSignals({ orderId: ORDER_ID, email: "a@b.co", phone: null });
    expect(saveOrderAdSignals).not.toHaveBeenCalled();
  });

  it("captures nothing while the Conversions API is not configured", async () => {
    isMetaConversionsEnabled.mockReturnValue(false);
    await captureOrderAdSignals({ orderId: ORDER_ID, email: "a@b.co", phone: null });
    expect(saveOrderAdSignals).not.toHaveBeenCalled();
  });

  it("never throws, even when the request APIs do", async () => {
    saveOrderAdSignals.mockRejectedValue(new Error("boom"));
    await expect(captureOrderAdSignals({ orderId: ORDER_ID, email: null, phone: null })).resolves.toBeUndefined();
  });
});

describe("reportPurchaseToMeta", () => {
  it("sends the order's own facts, then deletes the signals", async () => {
    await expect(reportPurchaseToMeta(ORDER_ID)).resolves.toBe("sent");

    const event = sendMetaServerEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      event_name: "Purchase",
      event_id: "purchase:261108-K-01050",
      event_source_url: "https://apuhanciftligi.com/odeme",
      custom_data: { value: 500, currency: "TRY", order_id: "261108-K-01050" },
    });
    expect(deleteOrderAdSignals).toHaveBeenCalledWith(ORDER_ID);
  });

  it("keeps the signals when Meta rejects the event", async () => {
    sendMetaServerEvent.mockResolvedValue({ ok: false, error: new Error("x") });
    await expect(reportPurchaseToMeta(ORDER_ID)).resolves.toBe("failed");
    expect(deleteOrderAdSignals).not.toHaveBeenCalled();
  });

  it("sends nothing without captured signals (GPC, or already reported)", async () => {
    readPendingPurchaseReport.mockResolvedValue({ ok: true, value: null });
    await expect(reportPurchaseToMeta(ORDER_ID)).resolves.toBe("skipped_no_signals");
    expect(sendMetaServerEvent).not.toHaveBeenCalled();
  });

  it("drops signals older than Meta's 7-day window instead of sending", async () => {
    readPendingPurchaseReport.mockResolvedValue({
      ok: true,
      value: { ...PENDING, capturedAtMs: Date.now() - 8 * 24 * 60 * 60 * 1000 },
    });
    await expect(reportPurchaseToMeta(ORDER_ID)).resolves.toBe("skipped_stale");
    expect(sendMetaServerEvent).not.toHaveBeenCalled();
    expect(deleteOrderAdSignals).toHaveBeenCalledWith(ORDER_ID);
  });

  it("does nothing while the Conversions API is not configured", async () => {
    isMetaConversionsEnabled.mockReturnValue(false);
    await expect(reportPurchaseToMeta(ORDER_ID)).resolves.toBe("skipped_not_configured");
    expect(readPendingPurchaseReport).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    readPendingPurchaseReport.mockRejectedValue(new Error("boom"));
    await expect(reportPurchaseToMeta(ORDER_ID)).resolves.toBe("failed");
  });
});
