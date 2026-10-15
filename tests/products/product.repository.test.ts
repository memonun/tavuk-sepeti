import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProduct,
  updateProductMetadata,
} from "@/features/products/infrastructure/product.repository";
import { createProductSchema } from "@/features/products/domain/product.schema";

const { insert, update, eq } = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/shared/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({ insert, update }),
  }),
}));
vi.mock("@/shared/supabase/admin", () => ({ getSupabaseAdminClient: vi.fn() }));
const input = createProductSchema.parse({
  display_name: "Köy Yumurtası",
  unit: "package",
  unit_label: "paket",
  package_size: 15,
  min_qty: 1,
  step: 1,
});

beforeEach(() => {
  vi.resetAllMocks();
  insert.mockResolvedValue({ error: null });
  update.mockReturnValue({ eq });
  eq.mockResolvedValue({ error: null });
});
describe("product web slug persistence", () => {
  it("inserts a default Turkish ASCII slug", async () => {
    expect((await createProduct(input)).ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ web_slug: "koy-yumurtasi" }),
    );
  });
  it("retries a unique collision with a bounded -2 URL suffix", async () => {
    insert.mockResolvedValueOnce({ error: { code: "23505" } });
    expect(
      (await createProduct({ ...input, web_slug: "a".repeat(80) })).ok,
    ).toBe(true);
    expect(insert.mock.calls[1]?.[0]).toMatchObject({
      web_slug: `${"a".repeat(78)}-2`,
    });
  });
  it("updates the URL by the original key and gives a useful duplicate message", async () => {
    eq.mockResolvedValueOnce({
      error: { code: "23505", message: "duplicate key" },
    });
    const result = await updateProductMetadata("eggs", {
      ...input,
      web_slug: "taze-yumurta",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ web_slug: "taze-yumurta" }),
    );
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("key");
    expect(eq).toHaveBeenCalledWith("key", "eggs");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("başka bir üründe");
  });
  it("keeps the long description when omitted and clears it on null", async () => {
    await updateProductMetadata("eggs", { ...input, web_long_description: undefined });
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("web_long_description");
    await updateProductMetadata("eggs", { ...input, web_long_description: null });
    expect(update.mock.calls[1]?.[0]).toMatchObject({ web_long_description: null });
    await updateProductMetadata("eggs", { ...input, web_long_description: "Uzun metin." });
    expect(update.mock.calls[2]?.[0]).toMatchObject({ web_long_description: "Uzun metin." });
  });
  it("inserts a new product's long description, or null when not given", async () => {
    await createProduct(input);
    expect(insert.mock.calls[0]?.[0]).toMatchObject({ web_long_description: null });
  });
  it("preserves the URL when an existing caller omits the field", async () => {
    const { web_slug: _slug, ...metadata } = input;
    await updateProductMetadata("eggs", metadata);
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("web_slug");
  });
});
