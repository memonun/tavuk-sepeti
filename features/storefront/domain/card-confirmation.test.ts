import { describe, expect, it } from "vitest";

import {
  CARD_CONFIRMATION_GRACE_MS,
  isAwaitingCardConfirmation,
  isAwaitingPayment,
  paymentStatusLabel,
  showsPaidBadge,
} from "@/features/storefront/domain/card-confirmation";

const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const cardOrder = {
  payment_status: "pending",
  payment_method: "credit_card",
  status: "pending",
  created_at: iso(30_000),
};

describe("isAwaitingPayment", () => {
  it("is false once the payment is booked", () => {
    expect(isAwaitingPayment({ ...cardOrder, payment_status: "paid" })).toBe(false);
  });

  it("is false for cash on delivery — unpaid by design until the driver arrives", () => {
    expect(
      isAwaitingPayment({ ...cardOrder, payment_method: "cash_on_delivery" }),
    ).toBe(false);
  });

  it("is false for a cancelled order", () => {
    expect(isAwaitingPayment({ ...cardOrder, status: "cancelled" })).toBe(false);
  });

  it("is true for an unpaid card order", () => {
    expect(isAwaitingPayment(cardOrder)).toBe(true);
  });
});

describe("isAwaitingCardConfirmation", () => {
  it("covers a card order placed moments ago — the callback is still in flight", () => {
    expect(isAwaitingCardConfirmation(cardOrder, NOW)).toBe(true);
  });

  it("stops covering it once the grace window closes", () => {
    const stale = { ...cardOrder, created_at: iso(CARD_CONFIRMATION_GRACE_MS + 1) };
    expect(isAwaitingCardConfirmation(stale, NOW)).toBe(false);
    expect(isAwaitingPayment(stale)).toBe(true);
  });

  it("never covers a paid order, so the badge can flip to Ödendi", () => {
    expect(
      isAwaitingCardConfirmation({ ...cardOrder, payment_status: "paid" }, NOW),
    ).toBe(false);
  });

  it("does not cover bank transfer — that waits on an admin, not on a webhook", () => {
    expect(
      isAwaitingCardConfirmation({ ...cardOrder, payment_method: "bank_transfer" }, NOW),
    ).toBe(false);
  });

  it("does not grant an open-ended grace period on an unparseable timestamp", () => {
    expect(isAwaitingCardConfirmation({ ...cardOrder, created_at: "not-a-date" }, NOW)).toBe(
      false,
    );
  });

  it("does not cover an order placed in the future beyond the window", () => {
    const skewed = { ...cardOrder, created_at: new Date(NOW + 60_000).toISOString() };
    // Clock skew must not make it look stale; a negative age is still inside.
    expect(isAwaitingCardConfirmation(skewed, NOW)).toBe(true);
  });
});

describe("showsPaidBadge", () => {
  it("affirms a paid card order", () => {
    expect(showsPaidBadge({ payment_status: "paid", payment_method: "credit_card" })).toBe(
      true,
    );
  });

  it("stays silent for cash on delivery, which is settled at the door", () => {
    expect(
      showsPaidBadge({ payment_status: "paid", payment_method: "cash_on_delivery" }),
    ).toBe(false);
  });

  it("stays silent while unpaid", () => {
    expect(
      showsPaidBadge({ payment_status: "pending", payment_method: "credit_card" }),
    ).toBe(false);
  });
});

describe("paymentStatusLabel", () => {
  it("says İptal edildi for a cancelled, unpaid order — regardless of payment method", () => {
    expect(paymentStatusLabel({ ...cardOrder, status: "cancelled" }, false)).toBe(
      "İptal edildi",
    );
    expect(
      paymentStatusLabel(
        { ...cardOrder, status: "cancelled", payment_method: "bank_transfer" },
        false,
      ),
    ).toBe("İptal edildi");
    expect(
      paymentStatusLabel(
        { ...cardOrder, status: "cancelled", payment_method: "cash_on_delivery" },
        false,
      ),
    ).toBe("İptal edildi");
  });

  it("still says Ödendi for a cancelled order that was actually paid", () => {
    expect(
      paymentStatusLabel(
        { ...cardOrder, status: "cancelled", payment_status: "paid" },
        false,
      ),
    ).toBe("Ödendi");
  });

  it("says Teslimatta ödenecek for a live cash-on-delivery order", () => {
    expect(
      paymentStatusLabel({ ...cardOrder, payment_method: "cash_on_delivery" }, false),
    ).toBe("Teslimatta ödenecek");
  });

  it("says Ödeme kontrol ediliyor when the caller says it's inside the grace window", () => {
    expect(paymentStatusLabel(cardOrder, true)).toBe("Ödeme kontrol ediliyor");
  });

  it("says Ödeme onayı bekliyor for a live bank-transfer order", () => {
    expect(
      paymentStatusLabel({ ...cardOrder, payment_method: "bank_transfer" }, false),
    ).toBe("Ödeme onayı bekliyor");
  });

  it("falls back to Ödeme bekliyor for a live card order once past the grace window", () => {
    expect(paymentStatusLabel(cardOrder, false)).toBe("Ödeme bekliyor");
  });

  it("cancelled beats an in-progress card confirmation flag", () => {
    // Defensive: even if a caller mistakenly still passed a stale "awaiting
    // confirmation" flag, a cancelled order must never read as in-progress.
    expect(paymentStatusLabel({ ...cardOrder, status: "cancelled" }, true)).toBe(
      "İptal edildi",
    );
  });
});
