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
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

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
  | { kind: "verify_email"; email: string };

export async function resolveCheckoutSession(
  account: CheckoutAccountParsed,
): Promise<Result<ResolveSessionOutcome, AppError>> {
  const supabase = await createSupabaseServerClient();

  if (account.mode === "signin") {
    const { error } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    if (error) {
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
        emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/hesap`,
        data: {
          first_name: account.first_name,
          last_name: account.last_name,
          phone: account.phone,
          role: "customer",
        },
      },
    });

    if (error) {
      // The most common case by far: this e-mail already has an account.
      if (/already|registered|exists/i.test(error.message)) {
        return err(
          new ValidationError({
            message:
              "Bu e-posta ile bir hesap var. \"Zaten hesabım var\" ile giriş yapın.",
          }),
        );
      }
      logger.warn({ message: error.message }, "checkout_signup_failed");
      return err(
        new ValidationError({ message: "Hesap oluşturulamadı, tekrar deneyin." }),
      );
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
    return err(
      new ValidationError({
        message: "Sipariş vermek için giriş yapın veya hesap oluşturun.",
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
