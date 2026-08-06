"use server";

/**
 * Storefront customer authentication (email + password via Supabase Auth).
 * Distinct from the admin auth actions: these redirect into `/`, and
 * signup does NOT grant any admin role — the auto-admin trigger was dropped in
 * migration 20260726120200, so a new auth user is just a customer.
 */
import { redirect } from "next/navigation";

import {
  customerSignInSchema,
  customerSignUpSchema,
  passwordResetRequestSchema,
  passwordUpdateSchema,
} from "@/features/storefront/domain/customer-auth.schema";
import { linkCustomerAccount } from "@/features/storefront/infrastructure/customer-account.repository";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type CustomerAuthState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "verify_email"; email: string };

export async function customerSignInAction(
  _previous: CustomerAuthState,
  formData: FormData,
): Promise<CustomerAuthState> {
  const parsed = customerSignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz giriş.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logger.warn({ supabaseStatus: error.status }, "customer_sign_in_failed");
    return { status: "error", message: "E-posta veya şifre hatalı." };
  }

  redirect("/hesap");
}

export async function customerSignUpAction(
  _previous: CustomerAuthState,
  formData: FormData,
): Promise<CustomerAuthState> {
  const parsed = customerSignUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz kayıt bilgisi.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
      data: {
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        phone: parsed.data.phone,
        role: "customer",
      },
    },
  });

  if (error) {
    logger.warn({ supabaseStatus: error.status }, "customer_sign_up_failed");
    const alreadyRegistered = /already|registered|exists/i.test(error.message);
    return {
      status: "error",
      message: alreadyRegistered
        ? "Bu e-posta ile zaten bir hesap var. Giriş yapın."
        : "Kayıt oluşturulamadı, tekrar deneyin.",
    };
  }

  // Create the CRM customer for this new login so it appears in the admin
  // immediately (not only after the first order). Never matches an existing
  // record — a legacy phone-ordered row with the same number stays untouched.
  if (data.user) {
    const linked = await linkCustomerAccount({
      authUserId: data.user.id,
      firstName: parsed.data.first_name || null,
      lastName: parsed.data.last_name || null,
      phone: parsed.data.phone,
      email: parsed.data.email,
    });
    if (!linked.ok) {
      logger.warn({ code: linked.error.code }, "customer_link_on_signup_failed");
      // A phone/email already taken by ANOTHER WEB account is a real, fixable
      // condition — surface it instead of leaving the customer with an account
      // whose phone was silently dropped (which is what used to happen, and it
      // produced route stops flagged "Telefon eksik" out of nowhere).
      if (linked.error.code === "VALIDATION_ERROR") {
        return { status: "error", message: linked.error.message };
      }
    }
  }

  // Email confirmation on → a user exists but there's no active session yet.
  if (data.user && !data.session) {
    return { status: "verify_email", email: parsed.data.email };
  }

  redirect("/hesap");
}

export async function customerSignOutAction(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export type PasswordResetRequestState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent" };

/**
 * "Forgot password" — email a recovery link. Always reports success (even when
 * the email isn't registered) so an attacker can't enumerate accounts. The
 * link lands on /auth/confirm, which establishes a recovery session and
 * forwards to the set-new-password page.
 */
export async function requestPasswordResetAction(
  _previous: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz e-posta.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/sifre-yenile`,
    },
  );
  if (error) {
    logger.warn({ supabaseStatus: error.status }, "password_reset_request_failed");
  }

  return { status: "sent" };
}

export type PasswordUpdateState =
  | { status: "idle" }
  | { status: "error"; message: string };

/**
 * Set a new password. Requires the recovery session established by the email
 * link (or an already-logged-in customer). On success the customer is signed in
 * and sent to their account.
 */
export async function updatePasswordAction(
  _previous: PasswordUpdateState,
  formData: FormData,
): Promise<PasswordUpdateState> {
  const parsed = passwordUpdateSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz şifre.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      status: "error",
      message:
        "Bağlantının süresi dolmuş olabilir. Lütfen yeni bir sıfırlama isteği gönderin.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    logger.warn({ supabaseStatus: error.status }, "password_update_failed");
    return { status: "error", message: "Şifre güncellenemedi, tekrar deneyin." };
  }

  redirect("/hesap");
}
