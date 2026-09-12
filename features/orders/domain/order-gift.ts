import { z } from "zod";

/**
 * Free samples/gifts (50-100gr cheese, a jar, etc.) staff add to an order by
 * hand at packing — no price, no order-total effect, just a tally of what
 * actually left the farm beyond what was sold. See
 * supabase/migrations/20260912120000_order_gift_items.sql for the schema
 * and the product_tally() RPC this feeds.
 *
 * unit_label is a fixed small set (not free text) so the tally report can
 * safely sum quantities per unit without a typo silently mixing grams into
 * a piece count.
 */
export const GIFT_UNIT_LABELS = ["gr", "kg", "adet", "ml"] as const;
export type GiftUnitLabel = (typeof GIFT_UNIT_LABELS)[number];

export interface OrderGiftItem {
  readonly id: string;
  readonly order_id: string;
  readonly product_key: string;
  /** Live product name (joined, not snapshotted — see the migration header
   *  for why a gift doesn't freeze product info the way order_items does). */
  readonly product_display_name: string;
  readonly quantity: number;
  readonly unit_label: GiftUnitLabel;
  readonly note: string | null;
  readonly created_at: Date;
}

const noteSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
  z.string().trim().max(200, "Not en fazla 200 karakter olabilir.").nullable(),
);

export const createOrderGiftSchema = z.object({
  order_id: z.string().uuid(),
  product_key: z.string().min(1, "Ürün seçmelisin."),
  quantity: z.coerce
    .number()
    .positive("Miktar 0'dan büyük olmalı.")
    .max(100000, "Miktar çok büyük."),
  unit_label: z.enum(GIFT_UNIT_LABELS, {
    message: "Geçerli bir birim seç.",
  }),
  note: noteSchema.default(null),
});

export type CreateOrderGiftInput = z.infer<typeof createOrderGiftSchema>;
