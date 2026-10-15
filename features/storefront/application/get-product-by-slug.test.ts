import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorefrontProductBySlug } from "@/features/storefront/application/get-product-by-slug";
import {
  getStorefrontCatalog,
  type Product,
} from "@/features/storefront/application/get-catalog";
import { ExternalApiError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

vi.mock("@/features/storefront/application/get-catalog", () => ({
  getStorefrontCatalog: vi.fn(),
}));
const product: Product = {
  key: "eggs",
  web_slug: "koy-yumurtasi",
  display_name: "Köy Yumurtası",
  unit: "package",
  unit_label: "paket",
  package_size: 15,
  min_qty: 1,
  step: 1,
  fulfillment_type: "delivery",
  is_web_visible: true,
  is_featured: false,
  web_description: null,
  image_path: null,
  image_alt: null,
  current_unit_price_minor: 12500,
  price_tiers: [],
  active: true,
  sort_order: 0,
  total_quantity_sold: 0,
};

beforeEach(() => vi.resetAllMocks());
describe("getStorefrontProductBySlug", () => {
  it("returns the original catalog product, including its prices", async () => {
    vi.mocked(getStorefrontCatalog).mockResolvedValue(ok([product]));
    const result = await getStorefrontProductBySlug("koy-yumurtasi");
    expect(result).toEqual(ok(product));
    if (result.ok) expect(result.value).toBe(product);
    expect(getStorefrontCatalog).toHaveBeenCalledTimes(1);
  });
  it("returns null for products absent from the public catalog and never resolves by PK", async () => {
    vi.mocked(getStorefrontCatalog).mockResolvedValue(ok([product]));
    expect(await getStorefrontProductBySlug("eggs")).toEqual(ok(null));
    vi.mocked(getStorefrontCatalog).mockResolvedValue(ok([]));
    expect(await getStorefrontProductBySlug("koy-yumurtasi")).toEqual(ok(null));
  });
  it("preserves a catalog failure instead of masking it as missing", async () => {
    const failure = new ExternalApiError();
    vi.mocked(getStorefrontCatalog).mockResolvedValue(err(failure));
    expect(await getStorefrontProductBySlug("sut")).toEqual(err(failure));
  });
  it("rejects invalid boundary input before reading the catalog", async () => {
    expect((await getStorefrontProductBySlug("../sut")).ok).toBe(false);
    expect(getStorefrontCatalog).not.toHaveBeenCalled();
  });
});
