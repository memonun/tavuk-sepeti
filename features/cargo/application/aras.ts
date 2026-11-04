import "server-only";

/**
 * Aras Kargo integration, server side. Credentials live in env and never leave
 * the server; when they are missing `isArasEnabled()` is false, the admin UI
 * hides the "Aras'a Gönder" button and cargo stays fully manual.
 *
 * `sendOrderToArasAs` takes an already-authorized actor (the Server Action in
 * send-to-aras.ts checks admin first). It is not in a "use server" file on
 * purpose: every export there is publicly callable.
 */
import { composeArasLabel, type ArasLabel } from "@/features/cargo/domain/aras-label";
import {
  arasCancelOutcome,
  arasTrackingUrl,
  buildArasOrder,
} from "@/features/cargo/domain/aras-order";
import {
  cancelArasDispatch,
  sendArasOrder,
  type ArasCredentials,
} from "@/features/cargo/infrastructure/aras-client";
import {
  fetchArasShipmentSource,
  findArasIntegrationCode,
  markOrderSentToAras,
} from "@/features/cargo/infrastructure/aras-shipment.repository";
import { logAudit } from "@/shared/audit/log-audit";
import {
  AppError,
  ExternalApiError,
  InvalidTransitionError,
} from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

function arasCreds(): ArasCredentials | null {
  const username = env.ARAS_SETORDER_USERNAME;
  const password = env.ARAS_SETORDER_PASSWORD;
  if (!username || !password) return null;
  return { username, password, testMode: env.ARAS_TEST_MODE === "1" };
}

/** True when the Aras SetOrder credentials are configured. */
export function isArasEnabled(): boolean {
  return arasCreds() !== null;
}

export async function sendOrderToArasAs(
  actor: { readonly id: string },
  orderId: string,
): Promise<Result<{ integrationCode: string }, AppError>> {
  const creds = arasCreds();
  if (!creds) {
    return err(
      new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, {
        message: "Aras Kargo entegrasyonu ayarlanmamış.",
      }),
    );
  }

  const source = await fetchArasShipmentSource(orderId);
  if (!source.ok) return source;
  if (source.value.fulfillmentChannel !== "shipping") {
    return err(new InvalidTransitionError({ message: "Bu sipariş kargo siparişi değil." }));
  }
  if (source.value.status !== "confirmed") {
    return err(
      new InvalidTransitionError({
        message: "Sadece onaylı ve henüz kargolanmamış siparişler Aras'a gönderilebilir.",
      }),
    );
  }

  const order = buildArasOrder(source.value);
  if (!order.ok) return order;

  const sent = await sendArasOrder(creds, order.value);
  if (!sent.ok) return sent;
  if (sent.value.resultCode !== "0") {
    // Aras's own message is already Turkish and specific ("İl / İlçe ismi
    // boş bırakılamaz…"), so show it to the admin as is.
    return err(
      new ExternalApiError({
        message: `Aras Kargo kabul etmedi: ${sent.value.resultMessage || `kod ${sent.value.resultCode}`}`,
        details: { resultCode: sent.value.resultCode },
      }),
    );
  }

  const { integrationCode } = order.value;
  const accountId = env.ARAS_TRACKING_ACCOUNT_ID;
  const marked = await markOrderSentToAras({
    orderId,
    integrationCode,
    trackingUrl: accountId ? arasTrackingUrl(accountId, integrationCode) : null,
  });
  if (!marked.ok) {
    // Aras has the record but we couldn't store the code. Sending again is
    // safe (Aras updates the same code), so tell the admin to retry.
    return err(
      new ExternalApiError({
        message: "Aras'a gönderildi ama kaydedilemedi. Lütfen tekrar gönderin.",
      }),
    );
  }

  await logAudit({
    actor_id: actor.id,
    action: "order.sent_to_aras",
    entity_type: "order",
    entity_id: orderId,
    before: { aras_integration_code: source.value.arasIntegrationCode },
    after: { aras_integration_code: integrationCode },
    metadata: { test_mode: creds.testMode },
  });

  return ok({ integrationCode });
}

/** The printable Aras label for an order that has been sent to Aras. */
export async function getArasLabel(orderId: string): Promise<Result<ArasLabel, AppError>> {
  const source = await fetchArasShipmentSource(orderId);
  if (!source.ok) return source;
  if (!source.value.arasIntegrationCode) {
    return err(
      new InvalidTransitionError({
        message: "Bu sipariş henüz Aras'a gönderilmedi. Önce \"Aras'a Gönder\"e basın.",
      }),
    );
  }
  return ok(
    composeArasLabel({
      integrationCode: source.value.arasIntegrationCode,
      firstName: source.value.firstName,
      lastName: source.value.lastName,
      printedAt: new Date(),
    }),
  );
}

/**
 * When an order is cancelled, delete its record at Aras too — but only if it
 * was sent there and the branch hasn't accepted the parcel yet. Best effort:
 * the cancellation itself already happened, so a failure here is logged and
 * audited, never returned to the caller.
 */
export async function cancelArasShipmentIfSent(
  actor: { readonly id: string },
  orderId: string,
): Promise<void> {
  const code = await findArasIntegrationCode(orderId);
  if (!code.ok || code.value === null) return;

  const creds = arasCreds();
  if (!creds) {
    logger.warn({ orderId }, "aras_cancel_skipped_not_configured");
    return;
  }

  const result = await cancelArasDispatch(creds, code.value);
  const outcome = result.ok ? arasCancelOutcome(result.value.resultCode) : "failed";
  if (outcome !== "cancelled") {
    logger.error(
      { orderId, integrationCode: code.value, outcome },
      "aras_cancel_not_done",
    );
  }

  await logAudit({
    actor_id: actor.id,
    action: "order.aras_cancelled",
    entity_type: "order",
    entity_id: orderId,
    after: { aras_integration_code: code.value, outcome },
  });
}
