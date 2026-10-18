import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/merchant-feed.xml/route";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { ExternalApiError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

import type { Product } from "@/features/products/application/list-products";

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/shared/env", () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" },
}));
vi.mock("@/features/storefront/application/get-catalog", () => ({
  getStorefrontCatalog: vi.fn(),
}));
vi.mock("@/shared/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn() },
  newCorrelationId: () => "test",
}));

beforeEach(() => vi.resetAllMocks());

const product = (overrides: Partial<Product>): Product => ({
  key: "dut-pekmezi",
  display_name: "Dut Pekmezi",
  web_slug: "dut-pekmezi",
  unit: "piece",
  unit_label: "kavanoz",
  package_size: 1,
  min_qty: 1,
  step: 1,
  current_unit_price_minor: 35_000,
  active: true,
  fulfillment_type: "shipping",
  is_web_visible: true,
  is_featured: false,
  web_description: "Bahçemizin dutlarından pekmez.",
  web_long_description: null,
  image_path: "dut-pekmezi.webp",
  image_alt: null,
  sort_order: 0,
  price_tiers: [],
  ...overrides,
} as Product);

describe("GET /merchant-feed.xml", () => {
  it("serves cargo products as XML with the page's price, kept out of search", async () => {
    vi.mocked(getStorefrontCatalog).mockResolvedValue(ok([
      product({}),
      product({ key: "eggs", web_slug: "koy-yumurtasi", fulfillment_type: "delivery" }),
    ]));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    const xml = await response.text();
    expect(xml).toContain("<g:id>dut-pekmezi</g:id>");
    expect(xml).toContain("<g:price>350.00 TRY</g:price>");
    expect(xml).toContain("<g:link>https://apuhanciftligi.com/urun/dut-pekmezi</g:link>");
    expect(xml).toContain("<g:image_link>https://");
    expect(xml).not.toContain("<g:id>eggs</g:id>");
  });

  it.each(["failed", "throws"])("answers 503, never an empty feed, when the catalog %s", async (state) => {
    if (state === "failed") vi.mocked(getStorefrontCatalog).mockResolvedValue(err(new ExternalApiError()));
    else vi.mocked(getStorefrontCatalog).mockRejectedValue(new Error("boom"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(await response.text()).not.toContain("<rss");
  });
});
