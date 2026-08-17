import { describe, expect, it, vi } from "vitest";

import { ok } from "@/shared/result";

// ---------------------------------------------------------------------------
// Mock the repository so createRecurringOrder is a spy (not a real DB call).
// ---------------------------------------------------------------------------
const createRecurringOrderSpy = vi.fn().mockResolvedValue(ok({ order_id: "o1" }));

vi.mock(
  "@/features/recurring/infrastructure/recurring-template.repository",
  () => ({
    createRecurringOrder: createRecurringOrderSpy,
  }),
);

// Import the SUT *after* the mock so it picks up the spy.
const { generateOrderForTemplate } = await import(
  "@/features/recurring/application/generate-order-for-template"
);

import type { RecurringTemplate } from "@/features/recurring/domain/recurring-template";
import type { Product } from "@/features/products/application/list-products";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const eggs: Product = {
  key: "eggs",
  display_name: "Yumurta",
  unit: "piece",
  unit_label: "adet",
  package_size: 1,
  min_qty: 1,
  step: 1,
  current_unit_price_minor: 12500,
  price_tiers: [],
  active: true,
  fulfillment_type: "delivery",
  is_web_visible: true,
  is_featured: false,
  web_description: null,
  image_path: null,
  image_alt: null,
  sort_order: 0,
};

const cheese: Product = {
  key: "cheese",
  display_name: "Peynir",
  unit: "kilogram",
  unit_label: "kg",
  package_size: 0.5,
  min_qty: 0.5,
  step: 0.5,
  current_unit_price_minor: 10000,
  price_tiers: [],
  active: true,
  fulfillment_type: "delivery",
  is_web_visible: true,
  is_featured: false,
  web_description: null,
  image_path: null,
  image_alt: null,
  sort_order: 0,
};

const products: Product[] = [eggs, cheese];

const template: RecurringTemplate = {
  id: "tpl-1",
  customer_id: "cust-1",
  cadence: "weekly",
  day_of_week: 1,
  day_of_month: null,
  items: [
    { product_key: "eggs", quantity: 3 },
    { product_key: "cheese", quantity: 1 },
  ],
  payment_method: "cash_on_delivery",
  active: true,
  next_run_at: new Date("2026-06-22T06:00:00+03:00"),
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

const SCHEDULED_FOR = "2026-06-22";

// ---------------------------------------------------------------------------

describe("generateOrderForTemplate", () => {
  it("(a) override price takes precedence over catalog price", async () => {
    createRecurringOrderSpy.mockClear();
    const overrides = { eggs: 12000 };

    const result = await generateOrderForTemplate(
      template,
      products,
      overrides,
      SCHEDULED_FOR,
      null,
    );

    expect(result.ok).toBe(true);
    expect(createRecurringOrderSpy).toHaveBeenCalledOnce();

    const callArg: { items: Array<{ product_key: string; unit_price_minor: number }> } =
      createRecurringOrderSpy.mock.calls[0]?.[0];
    const eggsLine = callArg.items.find((i) => i.product_key === "eggs");
    expect(eggsLine?.unit_price_minor).toBe(12000);
  });

  it("(b) without override uses catalog price", async () => {
    createRecurringOrderSpy.mockClear();

    const result = await generateOrderForTemplate(
      template,
      products,
      {},
      SCHEDULED_FOR,
      null,
    );

    expect(result.ok).toBe(true);
    const callArg: { items: Array<{ product_key: string; unit_price_minor: number }> } =
      createRecurringOrderSpy.mock.calls[0]?.[0];
    const eggsLine = callArg.items.find((i) => i.product_key === "eggs");
    expect(eggsLine?.unit_price_minor).toBe(12500);
  });

  it("(c) invalid step quantity returns ValidationError and does NOT call createRecurringOrder", async () => {
    createRecurringOrderSpy.mockClear();

    const badTemplate: RecurringTemplate = {
      ...template,
      id: "tpl-bad",
      items: [{ product_key: "cheese", quantity: 0.3 }], // 0.3 is not a multiple of 0.5
    };

    const result = await generateOrderForTemplate(
      badTemplate,
      products,
      {},
      SCHEDULED_FOR,
      null,
    );

    expect(result.ok).toBe(false);
    expect(createRecurringOrderSpy).not.toHaveBeenCalled();
  });

  it("(d) scheduled_for is passed through to createRecurringOrder", async () => {
    createRecurringOrderSpy.mockClear();
    const customDate = "2026-07-15";

    const result = await generateOrderForTemplate(
      template,
      products,
      {},
      customDate,
      null,
    );

    expect(result.ok).toBe(true);
    const callArg: { scheduled_for: string } = createRecurringOrderSpy.mock.calls[0]?.[0];
    expect(callArg.scheduled_for).toBe(customDate);
  });
});
