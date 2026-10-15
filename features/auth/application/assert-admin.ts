/**
 * Admin authorization helper — call this at the top of every mutating
 * Server Action that an unprivileged authenticated user must not be
 * able to invoke.
 *
 * `getCurrentUser()` only validates that *some* session exists. With
 * Supabase Auth, anyone with the anon key (and a working email
 * provider) can sign up and become a non-admin user — RLS would then
 * still block the actual DB write, but the audit-log row, the
 * revalidatePath cache bust, and the cost of the round-trip would
 * already have happened.
 *
 * Use this helper to fail fast at the action boundary and keep the
 * audit trail honest (only successful admin actions get logged).
 */
import "server-only";

import { cache } from "react";

import {
  ForbiddenError,
  UnauthorizedError,
  type AppError,
} from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { SessionUser } from "@/features/auth/application/get-session";

/**
 * Memoised per request (React `cache`): the admin layout, the page and the
 * data actions it calls during render all ask, and each un-cached call was two
 * more round trips to Supabase (getUser + is_admin). Outside a render (a Server
 * Action's own request, the MCP route) `cache` does not memoise across
 * requests, so every request is still checked.
 */
export const assertAdmin = cache(async (): Promise<Result<SessionUser, AppError>> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return err(new UnauthorizedError({ message: "Oturum bulunamadı." }));
  }

  // is_admin() is a SQL function in public schema; runs as the calling
  // user so RLS context is respected.
  const { data: isAdminFlag, error } = await supabase.rpc("is_admin");
  if (error) {
    logger.error({ userId: user.id, code: error.code }, "assert_admin_rpc_failed");
    return err(
      new ForbiddenError({
        message: "Yetki kontrolü başarısız oldu.",
        cause: error,
      }),
    );
  }
  if (isAdminFlag !== true) {
    logger.warn({ userId: user.id }, "assert_admin_denied");
    return err(
      new ForbiddenError({
        message: "Bu işlem için admin yetkisi gerekli.",
      }),
    );
  }

  return ok({ id: user.id, email: user.email ?? null });
});
