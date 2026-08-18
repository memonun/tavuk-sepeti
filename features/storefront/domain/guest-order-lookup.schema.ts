/**
 * Guest order lookup — phone + order type, replacing order_number as the
 * second factor (see lookup_guest_orders_by_phone_and_type, 20260819170000).
 * Every matching order comes back for the guest to pick from; no placement
 * date is asked since most guests don't remember it.
 */
import { z } from "zod";

import { isE164TR, normalizeTRPhone } from "@/shared/utils/phone";

const phoneTR = z
  .string()
  .min(1, "Telefon gerekli.")
  .transform((s, ctx) => {
    const normalized = normalizeTRPhone(s);
    if (normalized === null || !isE164TR(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Geçerli bir telefon girin (ör. 0532 123 45 67).",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const GUEST_ORDER_TYPES = ["delivery", "shipping", "recurring"] as const;
export type GuestOrderType = (typeof GUEST_ORDER_TYPES)[number];

export const GUEST_ORDER_TYPE_OPTIONS: ReadonlyArray<{
  value: GuestOrderType;
  emoji: string;
  label: string;
}> = [
  { value: "delivery", emoji: "📍", label: "Malatya içi teslimat" },
  { value: "shipping", emoji: "📦", label: "Kargo" },
  { value: "recurring", emoji: "🔄", label: "Düzenli sipariş" },
];

export const guestOrderLookupSchema = z.object({
  phone: phoneTR,
  order_type: z.enum(GUEST_ORDER_TYPES, {
    errorMap: () => ({ message: "Sipariş türünü seçin." }),
  }),
});

export type GuestOrderLookupInput = z.input<typeof guestOrderLookupSchema>;
