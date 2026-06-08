import { describe, expect, it } from "vitest";

import { rowToCustomer, rowToListItem } from "@/features/customers/infrastructure/customer.mapper";

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    notes: null,
    status: "active",
    account_type: "individual",
    tag: null,
    legacy_segment: null,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
    created_by: null,
    addresses: [],
    ...overrides,
  };
}

describe("rowToCustomer (relaxed)", () => {
  it("returns address: null when the customer has no primary address", () => {
    const customer = rowToCustomer(baseRow() as never);
    expect(customer.address).toBeNull();
    expect(customer.first_name).toBeNull();
  });
});

describe("rowToListItem (relaxed)", () => {
  it("maps null names + missing city without throwing", () => {
    const item = rowToListItem({
      id: "1",
      first_name: null,
      last_name: null,
      phone: null,
      email: null,
      status: "active",
      account_type: null,
      tag: null,
      legacy_segment: null,
      created_at: "2026-06-08T00:00:00.000Z",
      addresses: [],
    } as never);
    expect(item.first_name).toBeNull();
    expect(item.city).toBeNull();
  });
});
