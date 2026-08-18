import "server-only";

/**
 * Resolve the session for a checkout submit.
 *
 * The owner's requirement was "hesap zorunlu olsun ama sipariş anına kadar
 * friction koyma": browsing and filling the basket stay anonymous, and the
 * account is created — or signed into — in the SAME submit that places the
 * order. So this runs inside `placeOrderAction` rather than behind a redirect
 * that would bounce the customer away from a full basket.
 *
 * Signup never reads an existing customer record; `link_customer_account`
 * always writes a fresh `customers` row with origin='customer_web'.
 */
import { linkCustomerAccount } from "@/features/storefront/infrastructure/customer-account.repository";
import { AppError, UnauthorizedError, ValidationError } from "@/shared/errors/app-error";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { AuthError, User } from "@supabase/supabase-js";

import type { CheckoutAccountParsed } from "@/features/storefront/domain/web-order.schema";

export interface CheckoutSession {
  authUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export type ResolveSessionOutcome =
  | { kind: "session"; session: CheckoutSession }
  /** Signup succeeded but Supabase requires email confirmation before issuing a
   *  session, so the order cannot be placed yet. The basket is untouched. */
  | { kind: "verify_email"; email: string }
  /** The e-mail already has an account. Not an error state: the caller flips the
   *  form into sign-in mode with the address prefilled, because making the
   *  customer find the "Zaten hesabım var" pill themselves is what produced the
   *  repeated-signup loop this whole module exists to break. */
  | { kind: "email_taken"; email: string };

/**
 * Did Supabase hand us the "obfuscated user" it returns instead of an error?
 *
 * With "Confirm email" ON, `signUp` for an address that already has a CONFIRMED
 * account returns HTTP 200 with a fake user — a random UUID, `identities: []`,
 * no session — and sends no mail. It never sets `error`, so the
 * `/already|registered|exists/` branch below is dead in that configuration.
 *
 * Treating that fake user as real is the production bug: `link_customer_account`
 * was called with the random id, found no `customers` row for it, tried to
 * INSERT, collided with `customers_email_unique_web`, and raised P0005 — which
 * surfaced to the customer as "Bu telefon veya e-posta başka bir hesapta
 * kayıtlı" while they were trying to create their FIRST account.
 *
 * A genuine new signup always carries exactly one identity.
 */
function isObfuscatedUser(user: User): boolean {
  return Array.isArray(user.identities) && user.identities.length === 0;
}

/**
 * Auth e-mails (confirmation, recovery) are rate-limited per project. Retrying
 * cannot clear it, so "tekrar deneyin" is actively wrong advice — it is what the
 * customers in the 2026-08-13 logs did nine times in twenty-two minutes.
 */
function isEmailRateLimited(error: AuthError): boolean {
  return error.code === "over_email_send_rate_limit" || error.status === 429;
}

/**
 * The account block's fields, read out of a checkout FormData.
 *
 * Shared by the account step (`createCheckoutAccountAction`) and the order
 * submit (`placeOrderAction`) so the two can never disagree about a field name —
 * a mismatch there is invisible in TypeScript and shows up as "the form does
 * nothing", which is exactly the bug this flow already had once.
 *
 * Returns `unknown` on purpose: the caller runs `checkoutAccountSchema` over it
 * (CLAUDE.md §4 — nothing from a form is trusted before Zod).
 */
export function readCheckoutAccountInput(formData: FormData): unknown {
  const mode = String(formData.get("account_mode") ?? "existing");

  if (mode === "signup") {
    return {
      mode: "signup",
      email: formData.get("account_email"),
      password: formData.get("account_password"),
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      phone: formData.get("phone"),
    };
  }
  if (mode === "signin") {
    return {
      mode: "signin",
      email: formData.get("account_email"),
      password: formData.get("account_password"),
    };
  }
  if (mode === "guest") {
    // Same field names as signup minus the password, so the two blocks can share
    // inputs in the form and a customer who ticks "hesap da oluştur" mid-way
    // keeps everything they already typed.
    return {
      mode: "guest",
      email: formData.get("account_email"),
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      phone: formData.get("phone"),
    };
  }
  return { mode: "existing" };
}

export interface ResolveCheckoutSessionOptions {
  /**
   * Where the confirmation link should land the customer. Checkout passes
   * `/odeme` so a confirmed signup returns to the basket it came from; the
   * standalone `/kayit` page keeps the default.
   */
  nextPath?: string;
}

export async function resolveCheckoutSession(
  account: CheckoutAccountParsed,
  options: ResolveCheckoutSessionOptions = {},
): Promise<Result<ResolveSessionOutcome, AppError>> {
  const nextPath = options.nextPath ?? "/hesap";
  const supabase = await createSupabaseServerClient();

  if (account.mode === "signin") {
    const { error } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    if (error) {
      // An unconfirmed account is NOT a bad password, and saying so sent people
      // to "şifremi unuttum" — burning another mail out of the same quota.
      if (error.code === "email_not_confirmed") {
        return err(
          new ValidationError({
            message:
              "E-posta adresiniz henüz doğrulanmamış. Size gönderdiğimiz doğrulama bağlantısına tıklayın.",
          }),
        );
      }
      if (isEmailRateLimited(error)) {
        return err(
          new ValidationError({
            message:
              "Şu anda çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.",
          }),
        );
      }
      // Deliberately not distinguishing "no such account" from "wrong password".
      return err(
        new ValidationError({ message: "E-posta veya şifre hatalı." }),
      );
    }
  }

  if (account.mode === "signup") {
    const { data, error } = await supabase.auth.signUp({
      email: account.email,
      password: account.password,
      options: {
        // The final destination, not the /auth/confirm hop: the mail template
        // pastes this into `…/auth/confirm?token_hash=…&next={{ .RedirectTo }}`,
        // and the confirm route reduces it back to a path. A template that
        // hardcodes the link instead drops this silently and strands everyone on
        // /hesap holding a full basket — which is what it did in production.
        emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}${nextPath}`,
        data: {
          first_name: account.first_name,
          last_name: account.last_name,
          phone: account.phone,
          role: "customer",
        },
      },
    });

    if (error) {
      if (isEmailRateLimited(error)) {
        logger.warn({ code: error.code }, "checkout_signup_rate_limited");
        return err(
          new ValidationError({
            message:
              "Şu anda çok fazla kayıt denemesi var. Lütfen birkaç dakika sonra tekrar deneyin.",
          }),
        );
      }
      // Only reachable with "Confirm email" OFF; kept so the behaviour is right
      // in both configurations. With it ON, see isObfuscatedUser below.
      if (
        error.code === "user_already_exists" ||
        /already|registered|exists/i.test(error.message)
      ) {
        return ok({ kind: "email_taken", email: account.email });
      }
      logger.warn({ code: error.code }, "checkout_signup_failed");
      return err(
        new ValidationError({ message: "Hesap oluşturulamadı, tekrar deneyin." }),
      );
    }

    // MUST come before linkCustomerAccount: the fake user's id belongs to nobody,
    // and writing it is what raised P0005 at the customer.
    if (data.user && isObfuscatedUser(data.user)) {
      logger.info({}, "checkout_signup_email_taken");
      return ok({ kind: "email_taken", email: account.email });
    }

    if (data.user) {
      // Create the CRM row immediately so the order has something to bind to.
      // Never matches a legacy row — see link_customer_account.
      const linked = await linkCustomerAccount({
        authUserId: data.user.id,
        firstName: account.first_name,
        lastName: account.last_name,
        phone: account.phone,
        email: account.email,
      });
      if (!linked.ok) return err(linked.error);
    }

    // Supabase issues no session when "Confirm email" is on. We cannot place the
    // order yet; the caller keeps the basket and tells the customer to confirm.
    if (data.user && !data.session) {
      return ok({ kind: "verify_email", email: account.email });
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Unauthorized, NOT a validation error. The caller needs to tell these
    // apart: a form-level red line is the right answer to a bad field, but for
    // a session that died mid-checkout it stranded the customer — the page was
    // still greeting them by name, the submit button stayed enabled, and every
    // click repeated the same sentence with no way to sign back in.
    return err(
      new UnauthorizedError({
        message: "Oturumunuz sonlanmış. Siparişi tamamlamak için tekrar giriş yapın.",
      }),
    );
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (value: unknown): string | null =>
    typeof value === "string" && value.trim() !== "" ? value : null;

  return ok({
    kind: "session",
    session: {
      authUserId: user.id,
      email: user.email ?? null,
      firstName: str(meta.first_name),
      lastName: str(meta.last_name),
      phone: str(meta.phone),
    },
  });
}
