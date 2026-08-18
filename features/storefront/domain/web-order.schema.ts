/**
 * Storefront checkout payload — single source of truth for the checkout form
 * (UI) and `placeOrderAction` (application). CLAUDE.md §4: the server action's
 * first statement parses with this.
 *
 * What changed and why:
 *
 * The old shape carried the customer's name/phone/email and a free-typed address
 * on every order, and the writer upserted `customers` by phone. That is how web
 * orders ended up merged onto legacy phone-ordered records, and how an order
 * could be placed with no map pin at all — invisible to the route, or worse,
 * routed to (0,0).
 *
 * Now the payload carries an `address_id` that already belongs to the account.
 * Identity comes from the session; the address (with its confirmed pin) was
 * validated and stored by `saveAddressAction` before this runs. That gives the
 * web writer the SAME precondition as the admin writer: an existing customer and
 * an existing address.
 *
 * `account` covers the "no friction until the order" requirement: a visitor
 * browses and fills the basket anonymously, and the account is created (or
 * signed into) in the same submit that places the order.
 */
import { z } from "zod";

import { isE164TR, normalizeTRPhone } from "@/shared/utils/phone";

const blankToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

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

/**
 * How the checkout resolves the account.
 *
 *   existing — already signed in; nothing to do.
 *   signup   — create the account inline, in the same submit as the order.
 *   signin   — "zaten hesabım var", also inline, so the basket is never lost.
 *
 * Phone is REQUIRED on signup: a route stop the driver cannot phone is a
 * delivery that fails at the door, and it is the field the CRM keys on.
 */
export const checkoutAccountSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing") }),
  /**
   * No account at all. Identity travels WITH the order because there is no
   * session to read it from and no `customers` row until the writer mints one.
   *
   * E-mail is OPTIONAL — a guest can be reached by phone alone, and
   * `lookup_guest_order`/siparis-sorgula finds the order by phone either way.
   * It only becomes load-bearing for two things, both already gated where they
   * happen rather than here: place-order.ts refuses a card payment (PayTR
   * requires one) and skips the confirmation e-mail, when there's no address to
   * send either to.
   */
  z.object({
    mode: z.literal("guest"),
    email: z.preprocess(
      blankToNull,
      z.string().trim().toLowerCase().email("Geçerli bir e-posta girin.").nullable(),
    ),
    first_name: z.string().trim().min(1, "Ad gerekli.").max(100),
    last_name: z.string().trim().min(1, "Soyad gerekli.").max(100),
    phone: phoneTR,
  }),
  z.object({
    mode: z.literal("signup"),
    email: z.string().email("Geçerli bir e-posta girin.").toLowerCase(),
    password: z.string().min(8, "Şifre en az 8 karakter olmalı."),
    first_name: z.string().trim().min(1, "Ad gerekli.").max(100),
    last_name: z.string().trim().min(1, "Soyad gerekli.").max(100),
    phone: phoneTR,
  }),
  z.object({
    mode: z.literal("signin"),
    email: z.string().email("Geçerli bir e-posta girin.").toLowerCase(),
    password: z.string().min(1, "Şifre gerekli."),
  }),
]);

export type CheckoutAccountInput = z.input<typeof checkoutAccountSchema>;
export type CheckoutAccountParsed = z.output<typeof checkoutAccountSchema>;

/** One basket line. Pricing is derived server-side — never sent by the client. */
export const webOrderItemSchema = z.object({
  product_key: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

export const webOrderSchema = z.object({
  account: checkoutAccountSchema,
  /** Mandatory sales acceptance; KVKK notice is informational and separate. */
  distance_sales_accepted: z.literal(true, {
    errorMap: () => ({
      message: "Sipariş vermek için satış belgelerini kabul etmelisiniz.",
    }),
  }),
  /**
   * The saved address this order ships to — must belong to the resolved
   * customer, which the RPC re-checks (P0004).
   *
   * Null ONLY for a guest: with no account there is no address book to pick
   * from, so the address is typed into this same form and travels beside the
   * order (parsed separately, per `address_mode`, by the same validator the
   * account path uses). `refineCheckoutAddress` below makes the two mutually
   * exclusive so neither can be silently missing.
   */
  // The hidden input submits "" when nothing is selected (and always, for a
  // guest), so blank has to mean "absent" before the UUID check runs — otherwise
  // an empty field fails as a malformed id rather than a missing one, and the
  // guest/account rule below never gets to speak.
  address_id: z.preprocess(
    blankToNull,
    z.string().uuid("Teslimat adresi seçin.").nullable(),
  ),
  /**
   * A client hint about what the basket is, so the form can render the right
   * address UI. The action RE-DERIVES it from the re-priced items and rejects a
   * mismatch, which is how a stale basket (an admin flipped a product to cargo
   * while the tab was open) gets caught instead of silently changing channel.
   */
  address_mode: z.enum(["route", "cargo"]),
  /**
   * Nullable because a CARGO basket is never asked for one: the owner dropped
   * the "hazırlanma günü" question for out-of-city parcels, so that form has no
   * date field at all and the action stamps the earliest allowed day itself.
   * A delivery order still requires it — and the action additionally checks it
   * against the owner's "eve servis günleri", which no client hint can bypass.
   */
  scheduled_for: z.preprocess(
    // Absent (no field rendered), blank, or explicitly null all mean the same
    // thing here — "the customer was not asked" — and must land on ONE value so
    // the action has a single case to branch on.
    (value) =>
      value === undefined || (typeof value === "string" && value.trim() === "")
        ? null
        : value,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Teslimat günü seçin.")
      .nullable(),
  ),
  time_slot: z.preprocess(
    blankToNull,
    z.enum(["morning", "afternoon", "evening"]).nullable(),
  ),
  payment_method: z.enum(["cash_on_delivery", "bank_transfer", "credit_card"], {
    message: "Ödeme yöntemi seçin.",
  }),
  delivery_notes: z.preprocess(blankToNull, z.string().max(2000).nullable()),
  items: z.array(webOrderItemSchema).min(1, "Sepetiniz boş."),
}).superRefine((value, ctx) => {
  // Exactly one address source, decided by whether there is an account. Without
  // this a guest submit with a stray `address_id`, or an account submit with
  // none, would reach the writer and fail there with a database error code
  // instead of a sentence the customer can act on.
  const isGuest = value.account.mode === "guest";
  if (!isGuest && value.address_id === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["address_id"],
      message: "Teslimat adresi seçin.",
    });
  }
  if (isGuest && value.address_id !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["address_id"],
      message: "Misafir siparişi kayıtlı adres kullanamaz.",
    });
  }
});

export type WebOrderItemInput = z.input<typeof webOrderItemSchema>;
export type WebOrderInput = z.input<typeof webOrderSchema>;
export type WebOrderParsed = z.output<typeof webOrderSchema>;
