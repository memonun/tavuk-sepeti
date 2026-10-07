import { beforeEach, describe, expect, it, vi } from "vitest";

const updateTag = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  updateTag: (...a: unknown[]) => updateTag(...a),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

const { invalidateCacheTag } = await import("@/shared/cache/invalidate-tag");

describe("invalidateCacheTag", () => {
  beforeEach(() => {
    updateTag.mockReset();
    revalidateTag.mockReset();
  });

  it("uses updateTag inside a Server Action (panel behaviour unchanged)", () => {
    invalidateCacheTag("customer-filter-options");
    expect(updateTag).toHaveBeenCalledWith("customer-filter-options");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("falls back to an immediate revalidateTag where updateTag is not allowed (Route Handlers)", () => {
    updateTag.mockImplementation(() => {
      throw new Error("updateTag can only be called from within a Server Action.");
    });
    expect(() => invalidateCacheTag("customer-filter-options")).not.toThrow();
    expect(revalidateTag).toHaveBeenCalledWith("customer-filter-options", { expire: 0 });
  });
});
