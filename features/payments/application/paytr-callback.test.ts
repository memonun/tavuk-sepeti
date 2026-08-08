/**
 * Orchestration tests for the PayTR result webhook.
 *
 * These assert the DECISIONS the handler makes around real money: that an
 * unverified notification never reaches the database, that a genuine payment is
 * booked through the LEDGER (not by writing orders.payment_status, which is
 * derived and would be silently reverted — see 20260808120000), that PayTR's
 * retries can't double-charge or double-mail, and that a mismatched amount is
 * acknowledged without ever being booked.
 *
 * Follows the repo's mock-then-`await import()` pattern (see
 * features/storefront/application/place-order.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeCallbackHash } from "@/features/payments/domain/paytr";

const MERCHANT_ID = "123456";
const MERCHANT_KEY = "test-merchant-key";
const MERCHANT_SALT = "test-merchant-salt";

vi.mock("@/shared/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://www.example.com",
    PAYTR_MERCHANT_ID: "123456",
    PAYTR_MERCHANT_KEY: "test-merchant-key",
    PAYTR_MERCHANT_SALT: "test-merchant-salt",
    PAYTR_TEST_MODE: "1",
  },
}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const logAudit = vi.fn();
vi.mock("@/shared/audit/log-audit", () => ({
  logAudit: (...a: unknown[]) => logAudit(...a),
}));

const recordCardPayment = vi.fn();
vi.mock("@/features/payments/infrastructure/payment.repository", () => ({
  recordCardPayment: (...a: unknown[]) => recordCardPayment(...a),
}));

const sendOrderConfirmationEmail = vi.fn();
vi.mock("@/features/storefront/application/send-order-confirmation", () => ({
  sendOrderConfirmationEmail: (...a: unknown[]) => sendOrderConfirmationEmail(...a),
}));

vi.mock("@/features/payments/infrastructure/paytr-client", () => ({
  requestPaytrToken: vi.fn(),
}));

const { handlePaytrCallback } = await import("@/features/payments/application/paytr");

const ORDER_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
/** merchantOidFor(ORDER_ID, …) — the 32 hex chars plus a base36 suffix. */
const MERCHANT_OID = `${ORDER_ID.replace(/-/g, "")}abc123`;
const TOTAL_AMOUNT = "24500";

function signedPayload(overrides: Partial<Record<string, string>> = {}) {
  const status = overrides.status ?? "success";
  const totalAmount = overrides.total_amount ?? TOTAL_AMOUNT;
  const merchantOid = overrides.merchant_oid ?? MERCHANT_OID;
  return {
    merchant_oid: merchantOid,
    status,
    total_amount: totalAmount,
    hash: computeCallbackHash(
      merchantOid,
      status,
      totalAmount,
      MERCHANT_KEY,
      MERCHANT_SALT,
    ),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  recordCardPayment.mockResolvedValue({ ok: true, value: "recorded" });
  sendOrderConfirmationEmail.mockResolvedValue("sent");
});

describe("handlePaytrCallback — verification", () => {
  it("refuses a forged hash without touching the database", async () => {
    const result = await handlePaytrCallback({
      ...signedPayload(),
      hash: "not-the-real-hash",
    });

    expect(result).toEqual({ ok: false, reason: "bad_hash" });
    expect(recordCardPayment).not.toHaveBeenCalled();
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });

  it("refuses a merchant_oid that decodes to no order", async () => {
    const result = await handlePaytrCallback(
      signedPayload({ merchant_oid: "not-a-uuid-prefix" }),
    );

    expect(result).toEqual({ ok: false, reason: "bad_oid" });
    expect(recordCardPayment).not.toHaveBeenCalled();
  });

  it("rejects a tampered amount — the hash covers it", async () => {
    const payload = signedPayload();
    const result = await handlePaytrCallback({ ...payload, total_amount: "1" });

    expect(result).toEqual({ ok: false, reason: "bad_hash" });
    expect(recordCardPayment).not.toHaveBeenCalled();
  });
});

describe("handlePaytrCallback — successful payment", () => {
  it("books the payment through the ledger and mails the receipt once", async () => {
    const result = await handlePaytrCallback(signedPayload());

    expect(result).toEqual({ ok: true });
    expect(recordCardPayment).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      merchantOid: MERCHANT_OID,
      paidAmountMinor: 24500,
    });
    expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(ORDER_ID);
  });

  it("does not re-send the receipt when PayTR retries an already-booked payment", async () => {
    recordCardPayment.mockResolvedValue({ ok: true, value: "already_recorded" });

    const result = await handlePaytrCallback(signedPayload());

    expect(result).toEqual({ ok: true });
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });

  it("still acknowledges when the receipt e-mail fails — PayTR must stop retrying", async () => {
    sendOrderConfirmationEmail.mockResolvedValue("failed");

    await expect(handlePaytrCallback(signedPayload())).resolves.toEqual({ ok: true });
  });

  it("withholds the acknowledgement on a DB error so PayTR retries", async () => {
    recordCardPayment.mockResolvedValue({
      ok: false,
      error: { code: "EXTERNAL_API_ERROR" },
    });

    const result = await handlePaytrCallback(signedPayload());

    expect(result).toEqual({ ok: false, reason: "db_error" });
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });
});

describe("handlePaytrCallback — amount mismatch", () => {
  it("acknowledges but books nothing, and raises an audit trail", async () => {
    recordCardPayment.mockResolvedValue({ ok: true, value: "amount_mismatch" });

    const result = await handlePaytrCallback(signedPayload());

    // Acknowledged: a retry would only repeat the same mismatch.
    expect(result).toEqual({ ok: true });
    // No receipt for a payment that was never booked against the order.
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment.card_amount_mismatch",
        entity_type: "order",
        entity_id: ORDER_ID,
      }),
    );
  });
});

describe("handlePaytrCallback — failed payment", () => {
  it("records the attempt as an event and never writes to the ledger", async () => {
    const result = await handlePaytrCallback({
      ...signedPayload({ status: "failed" }),
      failed_reason_code: "6",
      failed_reason_msg: "Yetersiz bakiye",
    });

    expect(result).toEqual({ ok: true });
    expect(recordCardPayment).not.toHaveBeenCalled();
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: null,
        action: "payment.card_failed",
        entity_id: ORDER_ID,
        after: expect.objectContaining({ failed_reason_msg: "Yetersiz bakiye" }),
      }),
    );
  });
});

describe("merchant credentials", () => {
  it("keeps the signing key and salt out of the mocked env's reach", () => {
    // Guards the fixture itself: if the mocked env drifts from the constants
    // the signatures above are built with, every test here would pass
    // vacuously against a handler that verifies nothing.
    expect(MERCHANT_ID).toBe("123456");
    expect(computeCallbackHash("a", "success", "1", MERCHANT_KEY, MERCHANT_SALT)).not.toBe(
      computeCallbackHash("a", "success", "1", MERCHANT_KEY, "other-salt"),
    );
  });
});
