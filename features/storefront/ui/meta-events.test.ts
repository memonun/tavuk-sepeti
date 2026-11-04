/**
 * A completed order becomes exactly one Meta `Purchase`: the server's total in
 * TRY, product keys as content ids, and the order number as the dedupe id a
 * future Conversions API send must reuse.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Product } from "@/features/products/application/list-products";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

function installBrowser(): Record<string, unknown> {
  const win: Record<string, unknown> = {
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    // Where a kapıda ödeme order completes.
    location: { href: "https://apuhanciftligi.com/odeme" },
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", { globalPrivacyControl: false });
  vi.stubGlobal("document", {
    createElement: () => ({ async: false, src: "" }),
    head: { appendChild: () => undefined },
  });
  return win;
}

async function load(pixelId: string | undefined) {
  vi.resetModules();
  if (pixelId === undefined) delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  else process.env.NEXT_PUBLIC_META_PIXEL_ID = pixelId;
  return import("@/features/storefront/ui/meta-events");
}

function purchases(win: Record<string, unknown>): unknown[][] {
  const fbq = win.fbq as { queue: unknown[][] } | undefined;
  return (fbq?.queue ?? []).filter((call) => call[0] === "track" && call[1] === "Purchase");
}

const EGGS: Product = {
  key: "eggs",
  display_name: "Yumurta",
  web_slug: null,
  web_long_description: null,
  unit: "package",
  unit_label: "paket",
  package_size: 15,
  min_qty: 1,
  step: 1,
  current_unit_price_minor: 10_000,
  discount_unit_price_minor: null,
  // Graduated: the 5th package onward is 80 ₺.
  price_tiers: [{ min_qty: 5, unit_price_minor: 8_000 }],
  active: true,
  fulfillment_type: "delivery",
  is_web_visible: true,
  is_featured: false,
  web_description: null,
  image_path: null,
  image_alt: null,
  sort_order: 0,
  total_quantity_sold: 0,
};

function customQueue(win: Record<string, unknown>, method: string, event: string): unknown[][] {
  const fbq = win.fbq as { queue: unknown[][] } | undefined;
  return (fbq?.queue ?? []).filter((call) => call[0] === method && call[1] === event);
}

const ORDER = {
  orderNumber: "ORD-2026-00123",
  totalMinor: 45_050,
  items: [
    { productKey: "eggs", quantity: 2 },
    { productKey: "kayisi", quantity: 1.5 },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
});

describe("trackOrderPurchased", () => {
  it("sends the server's total and lines under the order's dedupe id", async () => {
    const win = installBrowser();
    const { trackOrderPurchased } = await load("123456789012345");

    trackOrderPurchased(ORDER);

    expect(purchases(win)).toEqual([
      [
        "track",
        "Purchase",
        {
          content_ids: ["eggs", "kayisi"],
          contents: [
            { id: "eggs", quantity: 2 },
            { id: "kayisi", quantity: 1.5 },
          ],
          content_type: "product",
          num_items: 2,
          value: 450.5,
          currency: "TRY",
        },
        { eventID: "purchase:ORD-2026-00123" },
      ],
    ]);
  });

  it("reports an order once, however often it is called", async () => {
    const win = installBrowser();
    const { trackOrderPurchased } = await load("123456789012345");

    trackOrderPurchased(ORDER);
    trackOrderPurchased(ORDER);

    expect(purchases(win)).toHaveLength(1);
  });

  it("does nothing without a Pixel ID", async () => {
    const win = installBrowser();
    const { trackOrderPurchased } = await load(undefined);

    trackOrderPurchased(ORDER);

    expect(win.fbq).toBeUndefined();
  });
});

describe("basket changes", () => {
  it('"+" reports the added amount, priced as the difference of the line totals', async () => {
    const win = installBrowser();
    const { trackProductQuantityIncreased } = await load("123456789012345");

    trackProductQuantityIncreased(EGGS, 1, 2);

    expect(customQueue(win, "track", "AddToCart")[0]?.[2]).toMatchObject({
      content_ids: ["eggs"],
      contents: [{ id: "eggs", quantity: 1 }],
      value: 100,
      currency: "TRY",
    });
  });

  it("reports the added unit at its tier price", async () => {
    const win = installBrowser();
    const { trackProductQuantityIncreased } = await load("123456789012345");

    trackProductQuantityIncreased(EGGS, 4, 5); // 4 × 100 ₺ = 400 ₺ → + 5th at 80 ₺ = 480 ₺

    expect(customQueue(win, "track", "AddToCart")[0]?.[2]).toMatchObject({ value: 80 });
  });

  it('"−" and "Çıkar" report what left the basket as RemoveFromCart', async () => {
    const win = installBrowser();
    const { trackProductQuantityDecreased } = await load("123456789012345");

    trackProductQuantityDecreased(EGGS, 3, 2);
    trackProductQuantityDecreased(EGGS, 2, 0);

    const removed = customQueue(win, "trackCustom", "RemoveFromCart");
    expect(removed.map((c) => c[2])).toEqual([
      expect.objectContaining({ contents: [{ id: "eggs", quantity: 1 }], value: 100 }),
      expect.objectContaining({ contents: [{ id: "eggs", quantity: 2 }], value: 200 }),
    ]);
  });

  it("ignores a change that is not one", async () => {
    const win = installBrowser();
    const { trackProductQuantityDecreased, trackProductQuantityIncreased } = await load("123456789012345");

    trackProductQuantityIncreased(EGGS, 2, 2);
    trackProductQuantityDecreased(EGGS, 2, 3);

    expect(win.fbq).toBeUndefined();
  });

  it("opening the basket reports its contents and subtotal", async () => {
    const win = installBrowser();
    const { trackCartViewed } = await load("123456789012345");

    trackCartViewed([{ product: EGGS, quantity: 2 }]);

    expect(customQueue(win, "trackCustom", "ViewCart")[0]?.[2]).toMatchObject({
      content_ids: ["eggs"],
      value: 200,
    });
  });

  it("checkout steps carry the basket; the address itself is never sent", async () => {
    const win = installBrowser();
    const { opaqueKey, trackPaymentInfoAdded, trackShippingInfoAdded } = await load("123456789012345");
    const address = JSON.stringify({ street: "Atatürk Cd.", building_no: "12" });

    trackShippingInfoAdded([{ product: EGGS, quantity: 2 }], "delivery", `g:${opaqueKey(address)}`);
    trackPaymentInfoAdded([{ product: EGGS, quantity: 2 }], "cash_on_delivery", 25_000);

    expect(customQueue(win, "trackCustom", "AddShippingInfo")[0]?.[2]).toMatchObject({
      shipping_tier: "eve_teslimat",
      value: 200,
    });
    expect(customQueue(win, "track", "AddPaymentInfo")[0]?.[2]).toMatchObject({
      payment_type: "cash_on_delivery",
      value: 250,
    });
    const everything = JSON.stringify((win.fbq as { queue: unknown[] }).queue);
    expect(everything).not.toContain("Atatürk");
  });

  it("a recurring-order request is a Lead with its products", async () => {
    const win = installBrowser();
    const { trackRecurringRequested } = await load("123456789012345");

    trackRecurringRequested([{ product_key: "eggs", quantity: 2 }]);

    expect(customQueue(win, "track", "Lead")[0]?.[2]).toMatchObject({
      content_category: "duzenli_siparis",
      content_ids: ["eggs"],
    });
  });

  it("opaqueKey is stable and distinguishes values", async () => {
    const { opaqueKey } = await load(undefined);
    expect(opaqueKey("a")).toBe(opaqueKey("a"));
    expect(opaqueKey("a")).not.toBe(opaqueKey("b"));
    expect(opaqueKey("Atatürk Cd. 12")).not.toContain("Atatürk");
  });
});

describe("trackProductViewed", () => {
  it("reports the product page's from-price, the same figure the merchant feed lists", async () => {
    const win = installBrowser();
    const { trackProductViewed } = await load("123456789012345");
    // Sold by the half kilo from 0.5 kg: the page shows 400 ₺/kg, not 200 ₺.
    const HONEY: Product = {
      ...EGGS,
      key: "bal",
      display_name: "Bal",
      unit: "kilogram",
      unit_label: "kg",
      min_qty: 0.5,
      step: 0.5,
      current_unit_price_minor: 40_000,
      price_tiers: [],
    };

    trackProductViewed(HONEY);

    expect(customQueue(win, "track", "ViewContent")).toEqual([
      [
        "track",
        "ViewContent",
        {
          content_ids: ["bal"],
          content_name: "Bal",
          content_type: "product",
          value: 400,
          currency: "TRY",
        },
      ],
    ]);
  });
});
