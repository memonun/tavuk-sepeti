import { describe, expect, it } from "vitest";

import {
  computeCallbackHash,
  computePaytrToken,
  encodeBasket,
  merchantOidFor,
  orderIdFromMerchantOid,
  verifyCallbackHash,
  type PaytrTokenFields,
} from "@/features/payments/domain/paytr";

const fields: PaytrTokenFields = {
  merchantId: "12345",
  userIp: "1.2.3.4",
  merchantOid: "abc123",
  email: "a@b.co",
  paymentAmount: 9927,
  userBasket: "W10=",
  noInstallment: "0",
  maxInstallment: "0",
  currency: "TL",
  testMode: "1",
};

describe("computePaytrToken", () => {
  it("is deterministic and sensitive to key + salt", () => {
    const t = computePaytrToken(fields, "key", "salt");
    expect(computePaytrToken(fields, "key", "salt")).toBe(t);
    expect(computePaytrToken(fields, "key", "salt2")).not.toBe(t);
    expect(computePaytrToken(fields, "key2", "salt")).not.toBe(t);
    expect(t).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("callback hash", () => {
  it("round-trips and rejects any tampering", () => {
    const h = computeCallbackHash("oid1", "success", "9927", "key", "salt");
    expect(verifyCallbackHash(h, "oid1", "success", "9927", "key", "salt")).toBe(true);
    expect(verifyCallbackHash(h, "oid1", "failed", "9927", "key", "salt")).toBe(false);
    expect(verifyCallbackHash(h, "oid1", "success", "9928", "key", "salt")).toBe(false);
    expect(verifyCallbackHash("AAAA", "oid1", "success", "9927", "key", "salt")).toBe(false);
  });
});

describe("encodeBasket", () => {
  it("encodes each line as [label, TL, 1]", () => {
    const b = encodeBasket([
      { label: "Yumurta × 2", totalMinor: 25000 },
      { label: "Süt × 1", totalMinor: 4000 },
    ]);
    const decoded: unknown = JSON.parse(Buffer.from(b, "base64").toString("utf8"));
    expect(decoded).toEqual([
      ["Yumurta × 2", "250.00", 1],
      ["Süt × 1", "40.00", 1],
    ]);
  });
});

describe("merchantOid ↔ orderId", () => {
  it("round-trips the order UUID and ignores the timestamp suffix", () => {
    const orderId = "2f1c8e4a-9b3d-4c5e-8a7f-1234567890ab";
    const oid = merchantOidFor(orderId, 1_700_000_000_000);
    expect(oid.startsWith("2f1c8e4a9b3d4c5e8a7f1234567890ab")).toBe(true);
    expect(oid.length).toBeGreaterThan(32);
    expect(orderIdFromMerchantOid(oid)).toBe(orderId);
  });

  it("returns null for a malformed oid", () => {
    expect(orderIdFromMerchantOid("not-a-valid-oid")).toBeNull();
  });
});
