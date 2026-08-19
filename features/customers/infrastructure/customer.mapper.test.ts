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

function addressRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-1111-1111-1111-111111111111",
    customer_id: "11111111-1111-1111-1111-111111111111",
    raw_text: "Test Mah. Test Sok. No:1",
    description: null,
    lat: 38.35,
    lng: 38.31,
    source: "geocoded_auto",
    accuracy: "unknown",
    geocoded_at: null,
    geocoder_response_hash: null,
    city: "Malatya",
    district: null,
    neighborhood: null,
    street: null,
    building_no: null,
    apartment_no: null,
    postal_code: null,
    country: "TR",
    is_primary: false,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("rowToCustomer (relaxed)", () => {
  it("returns address: null and an empty addresses list when the customer has none", () => {
    const customer = rowToCustomer(baseRow() as never);
    expect(customer.address).toBeNull();
    expect(customer.addresses).toEqual([]);
    expect(customer.first_name).toBeNull();
  });

  it("lists every address, primary first regardless of join order", () => {
    const secondary = addressRow({ id: "aaaaaaaa-2222-2222-2222-222222222222", raw_text: "İş adresi" });
    const primary = addressRow({ id: "aaaaaaaa-1111-1111-1111-111111111111", raw_text: "Ev adresi", is_primary: true });
    const customer = rowToCustomer(
      baseRow({ addresses: [secondary, primary] }) as never,
    );
    expect(customer.address?.raw_text).toBe("Ev adresi");
    expect(customer.addresses.map((a) => a.raw_text)).toEqual(["Ev adresi", "İş adresi"]);
    expect(customer.addresses[0]?.is_primary).toBe(true);
  });

  it("falls back to DB join order when no address is marked primary", () => {
    const one = addressRow({ id: "aaaaaaaa-3333-3333-3333-333333333333", raw_text: "Birinci" });
    const two = addressRow({ id: "aaaaaaaa-4444-4444-4444-444444444444", raw_text: "İkinci" });
    const customer = rowToCustomer(baseRow({ addresses: [one, two] }) as never);
    expect(customer.address).toBeNull();
    expect(customer.addresses.map((a) => a.raw_text)).toEqual(["Birinci", "İkinci"]);
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
