import { describe, expect, it } from "vitest";

import { rowToListItem } from "@/features/orders/infrastructure/order.mapper";

const baseRow = {
  id: "11111111-2222-4333-8444-555555555555",
  order_number: "ORD-2026-0001",
  customer_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  status: "pending",
  scheduled_for: "2026-11-24",
  time_slot: null,
  total_minor: 35000,
  payment_method: "cash_on_delivery",
  payment_status: "pending",
  amount_paid_minor: 0,
  delivery_notes: null,
  delivery_fee_minor: 0,
  created_at: "2026-11-23T10:00:00Z",
  source: "admin",
  fulfillment_channel: "delivery",
  cargo_carrier: null,
  cargo_tracking_number: null,
  cargo_tracking_url: null,
  recurring_template_id: null,
};

describe("rowToListItem — customer phone for the WhatsApp button", () => {
  it("carries the customer's phone through to the list item", () => {
    const item = rowToListItem({
      ...baseRow,
      customers: { first_name: "Ayşe", last_name: "Turhan", phone: "+905321234567" },
    });
    expect(item.customer_name).toBe("Ayşe Turhan");
    expect(item.customer_phone).toBe("+905321234567");
  });

  it("is null for a customer without a phone, and when the customer is missing", () => {
    expect(
      rowToListItem({ ...baseRow, customers: { first_name: "Ali", last_name: null, phone: null } })
        .customer_phone,
    ).toBeNull();
    expect(rowToListItem({ ...baseRow, customers: null }).customer_phone).toBeNull();
  });
});
