/**
 * What is still missing before the checkout can go — every item, by name.
 *
 * The submit area used to show one generic line ("önce teslimat adresinizi
 * girin") for whatever came first, which left a customer staring at a filled-in
 * form and a grey button with no idea which field it meant (owner request
 * 2026-10-20: "eksik bilgi olduğunda daha detaylı açıklama"). This lists all of
 * them, each tagged with the step it lives in, in the order the page shows them.
 *
 * The order floor and the "no delivery day" case are left out on purpose: both
 * already have their own alert with the exact amount / reason.
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

export type CheckoutAddressState =
  /** Signed in: picks from the address book. */
  | { readonly kind: "account"; readonly selected: boolean }
  /** Guest: typed inline. `missing` names the empty fields the form reported;
   *  `invalidMessage` is the server's answer for a complete but refused one. */
  | {
      readonly kind: "guest";
      readonly complete: boolean;
      readonly missing: readonly string[];
      readonly invalidMessage: string | null;
    };

export interface CheckoutMissingInput {
  /** Null for a signed-in customer — their contact details come from the account. */
  readonly contact: GuestContactInput | null;
  readonly address: CheckoutAddressState;
  readonly distanceSalesAccepted: boolean;
}

/** Loose on purpose; the server's Zod `.email()` has the final word. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Contact problems, by field label. Empty when the block is fine. */
export function contactProblems(contact: GuestContactInput): string[] {
  const problems: string[] = [];
  if (contact.firstName.trim() === "") problems.push("Ad");
  if (contact.lastName.trim() === "") problems.push("Soyad");

  const phone = contact.phone.trim();
  if (phone === "") {
    problems.push("Telefon");
  } else {
    const normalized = normalizeTRPhone(phone);
    if (normalized === null || !isE164TR(normalized)) {
      problems.push("geçerli bir telefon (ör. 0532 123 45 67)");
    }
  }

  const email = contact.email.trim();
  if (email === "") {
    if (contact.emailRequired) problems.push("E-posta (kartla ödemede zorunlu)");
  } else if (!EMAIL_SHAPE.test(email)) {
    problems.push("geçerli bir e-posta");
  }
  return problems;
}

/** One line per step that still needs something. Empty when nothing is missing. */
export function listCheckoutMissing(input: CheckoutMissingInput): string[] {
  const lines: string[] = [];

  if (input.contact) {
    const problems = contactProblems(input.contact);
    if (problems.length > 0) {
      lines.push(`1. İletişim: ${problems.join(", ")} eksik.`);
    }
  }

  const address = input.address;
  if (address.kind === "account") {
    if (!address.selected) {
      lines.push("2. Teslimat adresi: bir adres seçin veya yeni adres ekleyin.");
    }
  } else if (address.invalidMessage !== null) {
    lines.push(`2. Teslimat adresi: ${address.invalidMessage}`);
  } else if (!address.complete) {
    lines.push(
      address.missing.length > 0
        ? `2. Teslimat adresi: ${address.missing.join(", ")} eksik.`
        : "2. Teslimat adresi: adresinizi girin.",
    );
  }

  if (!input.distanceSalesAccepted) {
    lines.push(
      "Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi onay kutusunu işaretleyin.",
    );
  }

  return lines;
}
