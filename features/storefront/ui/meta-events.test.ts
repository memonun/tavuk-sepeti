/**
 * A completed order becomes exactly one Meta `Purchase`: the server's total in
 * TRY, product keys as content ids, and the order number as the dedupe id a
 * future Conversions API send must reuse.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

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
