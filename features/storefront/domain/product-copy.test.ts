import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { APPROVED_PRODUCT_COPY, getProductDescriptionReferences } from "./product-copy";

describe("approved product description references", () => {
  it("matches the six approved descriptions applied by the data migration", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261016203627_kisa_urun_aciklamalari.sql"), "utf8");
    const migrated = [...sql.matchAll(/\('([a-z-]+)', \$copy\$([\s\S]*?)\$copy\$\)/g)]
      .map(([, key, description]) => ({ key, description }));
    expect(migrated).toEqual(APPROVED_PRODUCT_COPY.map(({ key, description }) => ({ key, description })));
    expect(new Set(migrated.map(({ key }) => key)).size).toBe(6);
  });

  it.each(APPROVED_PRODUCT_COPY)("returns references only for the matching $key text", (copy) => {
    expect(getProductDescriptionReferences(copy.key, copy.description)).toEqual(copy);
    expect(getProductDescriptionReferences(copy.key, ` ${copy.description} `)).toEqual(copy);
    expect(getProductDescriptionReferences(copy.key, "Panelden yazılan yeni açıklama")).toBeNull();
    expect(getProductDescriptionReferences("another-product", copy.description)).toBeNull();
  });

  it.each([null, undefined, "", "   "])("does not attach references to missing text %s", (text) => {
    expect(getProductDescriptionReferences("eggs", text)).toBeNull();
  });

  it("keeps nutrition references separate from unverified kernel properties", () => {
    const kernel = APPROVED_PRODUCT_COPY.find(({ key }) => key === "gun-kurusu-kayisi-cekirdegi");
    expect(kernel?.sources.map(({ kind }) => kind)).toEqual(["catalog"]);
    expect(APPROVED_PRODUCT_COPY.filter(({ sources }) => sources.some(({ kind }) => kind === "nutrition"))).toHaveLength(4);
  });
});
