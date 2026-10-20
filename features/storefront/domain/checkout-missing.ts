/**
 * What is still missing before the checkout can go — every item, by name, and
 * where on the page it is.
 *
 * The submit area used to show one generic line ("önce teslimat adresinizi
 * girin") for whatever came first, which left a customer staring at a filled-in
 * form and a grey button with no idea which field it meant (owner request
 * 2026-10-20: "eksik bilgi olduğunda daha detaylı açıklama"). This lists all of
 * them, each tagged with the step it lives in, in the order the page shows them.
 *
 * Each line also carries the id of the control to jump to. The submit button is
 * never greyed out any more (most of our customers are 50+, and a dead button
 * reads as a broken site): pressing it with something missing scrolls to the
 * first line's control instead, and every problem field gets its own sentence
 * underneath (`fieldErrors`).
 *
 * Pure and client-safe. The phone check is the SAME pair of functions the order
 * schema runs (web-order.schema.ts), so the list never calls a number wrong
 * that the server would accept, or the other way round.
 */
import { isE164TR, normalizeTRPhone } from "@/shared/utils/phone";

export interface GuestContactInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly email: string;
  /** Card payments only — PayTR will not take one without an e-mail. */
  readonly emailRequired: boolean;
}

/** One thing to fix: what the list calls it, where it is, what to tell the
 *  customer right under the field. */
export interface MissingField {
  readonly label: string;
  /** Element id of the control (or block) to scroll to. */
  readonly target: string;
  readonly message: string;
}

export type CheckoutAddressState =
  /** Signed in: picks from the address book. */
  | { readonly kind: "account"; readonly selected: boolean }
  /** Guest: typed inline. `missing` is what the address form reported;
   *  `invalidMessage` is the server's answer for a complete but refused one. */
  | {
      readonly kind: "guest";
      readonly complete: boolean;
      readonly missing: readonly MissingField[];
      readonly invalidMessage: string | null;
    };

export interface CheckoutMissingInput {
  /** Null for a signed-in customer — their contact details come from the account. */
  readonly contact: GuestContactInput | null;
  readonly address: CheckoutAddressState;
  readonly distanceSalesAccepted: boolean;
}

export interface MissingLine {
  readonly text: string;
  /** Element id the submit button scrolls to when this is the first line. */
  readonly target: string;
}

/** Ids of the blocks a line can point at that are not a single input. */
export const CHECKOUT_TARGETS = {
  addressPicker: "checkout-address-picker",
  addressError: "checkout-address-error",
  addressForm: "checkout-address-form",
  distanceSales: "distance_sales_accepted",
} as const;

/** Loose on purpose; the server's Zod `.email()` has the final word. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Contact problems, in field order. Empty when the block is fine. The targets
 *  are the GuestBlock input ids, which are also the order form's field names. */
export function contactProblems(contact: GuestContactInput): MissingField[] {
  const problems: MissingField[] = [];
  if (contact.firstName.trim() === "") {
    problems.push({ label: "Ad", target: "first_name", message: "Adınızı yazın." });
  }
  if (contact.lastName.trim() === "") {
    problems.push({ label: "Soyad", target: "last_name", message: "Soyadınızı yazın." });
  }

  const phone = contact.phone.trim();
  if (phone === "") {
    problems.push({
      label: "Telefon",
      target: "phone",
      message: "Telefon numaranızı yazın (ör. 0532 123 45 67).",
    });
  } else {
    const normalized = normalizeTRPhone(phone);
    if (normalized === null || !isE164TR(normalized)) {
      problems.push({
        label: "geçerli bir telefon (ör. 0532 123 45 67)",
        target: "phone",
        message: "Telefon numarası eksik veya hatalı. Örnek: 0532 123 45 67",
      });
    }
  }

  const email = contact.email.trim();
  if (email === "") {
    if (contact.emailRequired) {
      problems.push({
        label: "E-posta (kartla ödemede zorunlu)",
        target: "account_email",
        message:
          "Kartla ödeme için e-posta gerekli. E-postanız yoksa ödeme yöntemini Havale/EFT veya Kapıda nakit yapın.",
      });
    }
  } else if (!EMAIL_SHAPE.test(email)) {
    problems.push({
      label: "geçerli bir e-posta",
      target: "account_email",
      message: "E-posta adresi hatalı. Örnek: ad@ornek.com",
    });
  }
  return problems;
}

/** One line per step that still needs something. Empty when nothing is missing. */
export function listCheckoutMissing(input: CheckoutMissingInput): MissingLine[] {
  const lines: MissingLine[] = [];

  if (input.contact) {
    const problems = contactProblems(input.contact);
    const first = problems[0];
    if (first) {
      lines.push({
        text: `1. İletişim: ${problems.map((p) => p.label).join(", ")} eksik.`,
        target: first.target,
      });
    }
  }

  const address = input.address;
  if (address.kind === "account") {
    if (!address.selected) {
      lines.push({
        text: "2. Teslimat adresi: bir adres seçin veya yeni adres ekleyin.",
        target: CHECKOUT_TARGETS.addressPicker,
      });
    }
  } else if (address.invalidMessage !== null) {
    lines.push({
      text: `2. Teslimat adresi: ${address.invalidMessage}`,
      target: CHECKOUT_TARGETS.addressError,
    });
  } else if (!address.complete) {
    const first = address.missing[0];
    lines.push(
      first
        ? {
            text: `2. Teslimat adresi: ${address.missing.map((m) => m.label).join(", ")} eksik.`,
            target: first.target,
          }
        : { text: "2. Teslimat adresi: adresinizi girin.", target: CHECKOUT_TARGETS.addressForm },
    );
  }

  if (!input.distanceSalesAccepted) {
    lines.push({
      text: "Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi onay kutusunu işaretleyin.",
      target: CHECKOUT_TARGETS.distanceSales,
    });
  }

  return lines;
}

/** Field id → the sentence shown under it, for every field with a problem.
 *  The checkout only shows these after the customer has pressed the button. */
export function fieldErrors(
  contact: GuestContactInput | null,
  addressMissing: readonly MissingField[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of [...(contact ? contactProblems(contact) : []), ...addressMissing]) {
    errors[field.target] ??= field.message;
  }
  return errors;
}
