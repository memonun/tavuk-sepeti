/**
 * Verifies the `Authorization: Bearer <jwt>` a Claude connector request carries.
 *
 * The token is a Supabase Auth access token (issued through Supabase's OAuth
 * 2.1 server after the admin approved the connector on /oauth/consent), so:
 *   1. `auth.getUser(token)` validates it against Supabase Auth (signature,
 *      expiry, revocation) — never trust the JWT payload alone.
 *   2. `is_admin()` runs as that user. Customers share this Supabase project, so
 *      "valid token" is NOT enough — only admins may use the connector.
 *
 * On success it returns a Supabase client bound to the token, which the route
 * installs via `runWithSupabaseClient` so the application layer runs as that
 * admin with RLS intact. No service-role key is involved.
 */
import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/shared/env";
import {
  ForbiddenError,
  UnauthorizedError,
  type AppError,
} from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

import type { RequestSupabaseClient } from "@/shared/supabase/request-client";
import type { Database } from "@/shared/supabase/types";

/**
 * The panel's application layer authenticates with `supabase.auth.getUser()`
 * (no argument), which reads the session from cookies. A bearer-only client has
 * no session, so that call would fail with "Auth session missing". Binding the
 * token as the default argument lets `assertAdmin()` / `getCurrentUser()` — and
 * therefore every existing Server Action — run unchanged for connector requests.
 * Only `auth.getUser` is wrapped; everything else is the untouched client.
 */
function bindTokenToGetUser(
  client: RequestSupabaseClient,
  token: string,
): RequestSupabaseClient {
  const auth = new Proxy(client.auth, {
    get(target, prop) {
      if (prop === "getUser") {
        return (jwt?: string) => target.getUser(jwt ?? token);
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "auth") return auth;
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export interface McpPrincipal {
  readonly userId: string;
  readonly client: RequestSupabaseClient;
}

const BEARER_RE = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/i;

export function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = BEARER_RE.exec(header.trim());
  return match?.[1] ?? null;
}

export async function verifyMcpToken(
  token: string,
): Promise<Result<McpPrincipal, AppError>> {
  const client = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    logger.warn({ supabaseStatus: error?.status }, "mcp_token_invalid");
    return err(new UnauthorizedError({ message: "Geçersiz veya süresi dolmuş token." }));
  }

  const { data: isAdminFlag, error: rpcError } = await client.rpc("is_admin");
  if (rpcError) {
    logger.error({ userId: data.user.id, code: rpcError.code }, "mcp_is_admin_rpc_failed");
    return err(
      new ForbiddenError({ message: "Yetki kontrolü başarısız oldu.", cause: rpcError }),
    );
  }
  if (isAdminFlag !== true) {
    logger.warn({ userId: data.user.id }, "mcp_admin_denied");
    return err(new ForbiddenError({ message: "Bu bağlantı için admin yetkisi gerekli." }));
  }

  return ok({ userId: data.user.id, client: bindTokenToGetUser(client, token) });
}
