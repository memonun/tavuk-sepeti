import { describe, expect, it } from "vitest";

import { derivePaymentStatus } from "@/features/orders/domain/payment";

describe("derivePaymentStatus", () => {
  it("is pending when nothing is paid", () => {
    expect(derivePaymentStatus(25000, 0)).toBe("pending");
  });
  it("is partial when some but not all is paid", () => {
    expect(derivePaymentStatus(25000, 10000)).toBe("partial");
    expect(derivePaymentStatus(25000, 24999)).toBe("partial");
  });
  it("is paid when paid meets or exceeds the total", () => {
    expect(derivePaymentStatus(25000, 25000)).toBe("paid");
    expect(derivePaymentStatus(25000, 30000)).toBe("paid"); // overpaid still paid
  });
  it("treats a net-negative balance (refunds) as pending", () => {
    expect(derivePaymentStatus(25000, -5000)).toBe("pending");
  });
});
