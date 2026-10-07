"use server";

import { redirect } from "next/navigation";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { connectorDecisionSchema } from "@/features/mcp/domain/connector-authorization.schema";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * Approve / deny a Claude connector authorization. Re-checks admin here — the
 * consent page's own check is a UX gate, this is the enforcement point — then
 * sends the browser back to the OAuth client (claude.ai) with the code / error.
 */
export async function decideConnectorAuthorizationAction(
  formData: FormData,
): Promise<void> {
  const parsed = connectorDecisionSchema.safeParse({
    authorization_id: formData.get("authorization_id"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) redirect("/oauth/consent?error=invalid");

  const { authorization_id, decision } = parsed.data;
  const retry = `/oauth/consent?authorization_id=${encodeURIComponent(authorization_id)}&error=failed`;

  const admin = await assertAdmin();
  if (!admin.ok) redirect(retry);

  const supabase = await createSupabaseServerClient();
  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorization_id, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorization_id, {
          skipBrowserRedirect: true,
        });

  if (error || !data) {
    logger.error(
      { decision, code: error?.code, status: error?.status },
      "connector_authorization_decision_failed",
    );
    redirect(retry);
  }

  logger.info({ decision, actorId: admin.value.id }, "connector_authorization_decided");
  redirect(data.redirect_url);
}
