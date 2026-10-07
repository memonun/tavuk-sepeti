import { describe, expect, it } from "vitest";

import {
  buildCreateCustomerFormData,
  buildUpdateCustomerFormData,
} from "@/features/mcp/application/tools/customer-form-data";

type Existing = Parameters<typeof buildUpdateCustomerFormData>[0];

const existing = {
  id: "c1",
  first_name: "Ayşe",
  last_name: "Yılmaz",
  email: "ayse@example.com",
  phone: "+905321234567",
  notes: "Eski not",
  status: "active",
  address: {
    city: "Malatya",
    district: "Yeşilyurt",
    neighborhood: "Çilesiz",
    street: "Gül Sk.",
    building_no: "4",
    apartment_no: "2",
    postal_code: "44000",
    description: "Kapıcıya bırak",
    coordinate: { lat: 38.31, lng: 38.31, source: "user_pin", accuracy: "rooftop" },
  },
} as unknown as Existing;

const entries = (fd: FormData) => Object.fromEntries(fd.entries());

describe("buildUpdateCustomerFormData", () => {
  it("preserves every field the caller did not mention", () => {
    const fd = entries(buildUpdateCustomerFormData(existing, { notes: "Yeni not" }));
    expect(fd).toMatchObject({
      first_name: "Ayşe",
      last_name: "Yılmaz",
      email: "ayse@example.com",
      phone: "+905321234567",
      notes: "Yeni not",
      status: "active",
    });
  });

  it("clears a field only when null is sent explicitly", () => {
    const fd = entries(buildUpdateCustomerFormData(existing, { email: null }));
    expect(fd.email).toBe("");
    expect(fd.first_name).toBe("Ayşe");
  });

  it("sends no address keys when the address is not being changed", () => {
    const fd = entries(buildUpdateCustomerFormData(existing, { status: "inactive" }));
    expect(Object.keys(fd).some((k) => k.startsWith("address."))).toBe(false);
    expect(fd.status).toBe("inactive");
  });

  it("merges a partial address over the stored one and keeps the existing pin", () => {
    const fd = entries(
      buildUpdateCustomerFormData(existing, { address: { street: "Lale Sk." } }),
    );
    expect(fd["address.street"]).toBe("Lale Sk.");
    expect(fd["address.city"]).toBe("Malatya");
    expect(fd["address.lat"]).toBe("38.31");
    expect(fd["address.source"]).toBe("user_pin");
    expect(fd["address.accuracy"]).toBe("rooftop");
  });

  it("replaces the pin when new coordinates are given", () => {
    const fd = entries(
      buildUpdateCustomerFormData(existing, { address: { lat: 40, lng: 29 } }),
    );
    expect(fd["address.lat"]).toBe("40");
    expect(fd["address.lng"]).toBe("29");
    expect(fd["address.source"]).toBe("admin_corrected");
  });
});

describe("buildCreateCustomerFormData", () => {
  it("defaults status to active and omits the address when none is given", () => {
    const fd = entries(buildCreateCustomerFormData({ first_name: "Ali" }));
    expect(fd.status).toBe("active");
    expect(fd.first_name).toBe("Ali");
    expect(Object.keys(fd).some((k) => k.startsWith("address."))).toBe(false);
  });

  it("writes a pinless address without inventing coordinates", () => {
    const fd = entries(buildCreateCustomerFormData({ address: { city: "Malatya" } }));
    expect(fd["address.city"]).toBe("Malatya");
    expect("address.lat" in fd).toBe(false);
  });
});
