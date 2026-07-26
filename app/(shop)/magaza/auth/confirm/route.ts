/**
 * Email-confirmation / magic-link landing for customer accounts.
 *
 * Supabase's confirmation email links here (set the project's Site URL +
 * redirect allowlist to `${NEXT_PUBLIC_APP_URL}/magaza/auth/confirm`). We
 * exchange the token for a session cookie, then send the customer to their
 * account. Handles both the token_hash (verifyOtp) and PKCE code flows.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/magaza/hesap";

  const supabase = await createSupabaseServerClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(new URL(next, origin));
    logger.warn({ supabaseStatus: error.status }, "customer_email_confirm_failed");
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    logger.warn({ supabaseStatus: error.status }, "customer_code_exchange_failed");
  }

  return NextResponse.redirect(
    new URL("/magaza/giris?error=confirm", origin),
  );
}
