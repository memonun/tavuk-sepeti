/**
 * Resolves what /oauth/consent should show for a Claude connector request.
 *
 * Customers share this Supabase Auth project, so an authenticated session is
 * not enough — only an admin may approve a connector, and a non-admin never
 * sees the client details.
 */
import "server-only";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { authorizationIdSchema } from "@/features/mcp/domain/connector-authorization.schema";
import { ErrorCode } from "@/shared/errors/error-codes";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type ConnectorAuthorizationView =
  | { kind: "invalid" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  /** Already decided / pre-consented — go straight back to the client. */
  | { kind: "redirect"; url: string }
  | {
      kind: "ready";
      authorizationId: string;
      clientName: string;
      redirectUri: string;
      scopes: string[];
      email: string;
    };

export async function loadConnectorAuthorization(
  rawAuthorizationId: unknown,
): Promise<ConnectorAuthorizationView> {
  const parsedId = authorizationIdSchema.safeParse(rawAuthorizationId);
  if (!parsedId.success) return { kind: "invalid" };

  const admin = await assertAdmin();
  if (!admin.ok) {
    return admin.error.code === ErrorCode.UNAUTHORIZED
      ? { kind: "unauthenticated" }
      : { kind: "forbidden" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(parsedId.data);
  if (error || !data) {
    logger.warn(
      { code: error?.code, status: error?.status },
      "connector_authorization_details_failed",
    );
    return { kind: "invalid" };
  }

  if ("redirect_url" in data) return { kind: "redirect", url: data.redirect_url };

  return {
    kind: "ready",
    authorizationId: data.authorization_id,
    clientName: data.client.name,
    redirectUri: data.redirect_uri,
    scopes: data.scope.split(" ").filter((s) => s.length > 0),
    email: admin.value.email ?? data.user.email,
  };
}
