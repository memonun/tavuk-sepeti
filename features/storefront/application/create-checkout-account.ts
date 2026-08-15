"use server";

/**
 * The checkout's account step — "Hesabımı oluştur" / "Giriş yap".
 *
 * WHY THIS EXISTS. The checkout used to create the account inside the order
 * submit, with no button of its own. That produced a dead end for every visitor
 * who arrived without an account:
 *
 *   - the address section refused to render ("önce hesabınızı oluşturun"),
 *     because saving an address needs an authenticated customer (RLS + the
 *     upsert RPC key off auth.uid());
 *   - the only submit button was "Siparişi ver", and it was disabled until an
 *     address was selected;
 *   - so the account was never created, the address could never be added, and
 *     the form simply did nothing — the owner's "hesap oluştur gibi bir buton
 *     yok, ilerlemiyor" and "üye girişi yapmadan adres seçimi çalışmıyor".
 *
 * Splitting the account out is what breaks the deadlock: this action
 * establishes the session, the page re-renders with the address picker, and the
 * order is then placed by `placeOrderAction`. The basket survives because it
 * lives in localStorage, not in the form.
 *
 * Session handling itself is unchanged — the same `resolveCheckoutSession` the
 * order submit used, so signup still creates the CRM row and still reports the
 * "confirm your e-mail" state.
 */
import { revalidatePath } from "next/cache";

import {
  readCheckoutAccountInput,
  resolveCheckoutSession,
} from "@/features/storefront/application/checkout-account";
import { checkoutAccountSchema } from "@/features/storefront/domain/web-order.schema";
import { logger } from "@/shared/logger";

export type CheckoutAccountState =
  | { status: "idle" }
  /** Session established — the page refreshes into the address step. */
  | { status: "success" }
  /** Supabase requires e-mail confirmation; no session yet. Basket untouched. */
  | { status: "verify_email"; email: string }
  /** The address already has an account. The form switches itself to sign-in
   *  with this e-mail filled in, rather than making the customer work it out. */
  | { status: "email_taken"; email: string }
  /** Recoverable, message is safe to render. `values` echoes what the customer
   *  typed: the account block is an uncontrolled form and React resets it once
   *  the action resolves, so without this every failure wipes six fields. */
  | { status: "error"; message: string; values?: CheckoutAccountValues };

/** Everything the signup form should repopulate. The password is deliberately
 *  NOT echoed — it would have to round-trip through the server response. */
export interface CheckoutAccountValues {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
}

function readValues(formData: FormData): CheckoutAccountValues {
  const str = (key: string): string => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    email: str("account_email"),
    first_name: str("first_name"),
    last_name: str("last_name"),
    phone: str("phone"),
  };
}

export async function createCheckoutAccountAction(
  _previous: CheckoutAccountState,
  formData: FormData,
): Promise<CheckoutAccountState> {
  const values = readValues(formData);
  const parsed = checkoutAccountSchema.safeParse(
    readCheckoutAccountInput(formData),
  );
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Formda eksik alanlar var.",
      values,
    };
  }

  if (parsed.data.mode === "existing") {
    // Nothing to do — the caller only renders this step for anonymous visitors.
    return { status: "success" };
  }

  // Confirmed signups come back to the basket they started from, not /hesap.
  const session = await resolveCheckoutSession(parsed.data, {
    nextPath: "/odeme",
  });
  if (!session.ok) {
    // Only ValidationError carries a message written for a customer. Anything
    // else is infrastructure (and `ExternalApiError` forwards the raw Postgres
    // string), so it gets a generic line and a log instead.
    if (session.error.code === "VALIDATION_ERROR") {
      return { status: "error", message: session.error.message, values };
    }
    logger.error({ code: session.error.code }, "checkout_account_failed");
    return {
      status: "error",
      message: "Hesabınız oluşturulamadı, lütfen tekrar deneyin.",
      values,
    };
  }

  if (session.value.kind === "verify_email") {
    return { status: "verify_email", email: session.value.email };
  }

  if (session.value.kind === "email_taken") {
    return { status: "email_taken", email: session.value.email };
  }

  logger.info({ mode: parsed.data.mode }, "checkout_account_resolved");

  // The checkout page reads the session (identity + saved addresses) on the
  // server, so it has to be re-rendered before the address step can appear.
  revalidatePath("/odeme");
  revalidatePath("/hesap");
  return { status: "success" };
}
