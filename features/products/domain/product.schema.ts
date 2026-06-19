/**
 * Product Zod schemas — single source of truth for the catalog-manager form
 * (UI) and the product Server Actions (application). Everything that reaches
 * the `products` table is parsed by these first.
 *
 * Numeric fields use `z.coerce.number()` because the form posts strings; the
 * `.positive()` bounds mirror the DB CHECK constraints (`> 0`) on
 * package_size / min_qty / step. Money is kuruş (minor units, CLAUDE.md §7).
 *
 * `key` is intentionally absent from the create/update shapes: it's a
 * permanent contract minted server-side (see ./product-key) and never edited.
 */
import { z } from "zod";

import type { ProductUnit } from "@/features/products/domain/product";

export const productUnitSchema = z.enum([
  "package",
  "liter",
  "kilogram",
  "piece",
]);

/** Unit values + Turkish labels for the `<Select>` in the product form. */
export const PRODUCT_UNIT_OPTIONS: ReadonlyArray<{
  value: ProductUnit;
  label: string;
}> = [
  { value: "package", label: "Paket" },
  { value: "liter", label: "Litre" },
  { value: "kilogram", label: "Kilogram" },
  { value: "piece", label: "Adet" },
];

/** The editable content fields of a product (everything except key + price). */
export const productMetadataSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "Ürün adı gerekli.")
    .max(100, "En fazla 100 karakter olabilir."),
  unit: productUnitSchema,
  unit_label: z
    .string()
    .trim()
    .min(1, "Birim etiketi gerekli.")
    .max(50, "En fazla 50 karakter olabilir."),
  package_size: z.coerce
    .number()
    .positive("Paket boyutu 0'dan büyük olmalı."),
  min_qty: z.coerce
    .number()
    .positive("Minimum miktar 0'dan büyük olmalı."),
  step: z.coerce.number().positive("Adım 0'dan büyük olmalı."),
});

export type ProductMetadataInput = z.input<typeof productMetadataSchema>;
export type ProductMetadata = z.output<typeof productMetadataSchema>;

/** Create payload: metadata + an optional starting base price (kuruş). */
export const createProductSchema = productMetadataSchema.extend({
  base_price_minor: z.coerce
    .number()
    .nonnegative("Birim fiyat negatif olamaz.")
    .default(0),
});

export type CreateProductInput = z.input<typeof createProductSchema>;

/** Update payload: which product (by key) + the new metadata. */
export const updateProductMetadataSchema = productMetadataSchema.extend({
  product_key: z.string().min(1),
});

export type UpdateProductMetadataInput = z.input<
  typeof updateProductMetadataSchema
>;

/** Archive / restore payload. */
export const setProductActiveSchema = z.object({
  product_key: z.string().min(1),
  active: z.boolean(),
});

export type SetProductActiveInput = z.input<typeof setProductActiveSchema>;
