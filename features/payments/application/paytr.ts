import "server-only";

/**
 * PayTR application layer: create a payment session (get-token → iframe URL) and
 * handle the result callback (verify → mark the order). Merchant secrets live in
 * env and never leave the server. When PayTR isn't configured, `isPaytrEnabled`
 * is false and checkout simply doesn't offer the card option.
 */
import {
  computePaytrToken,
  encodeBasket,
  merchantOidFor,
  orderIdFromMerchantOid,
  signOrderReturnToken,
  verifyCallbackHash,
  verifyOrderReturnToken,
  type BasketLine,
} from "@/features/payments/domain/paytr";
import { requestPaytrToken } from "@/features/payments/infrastructure/paytr-client";
import { recordCardPayment } from "@/features/payments/infrastructure/payment.repository";
import { sendOrderConfirmationEmail } from "@/features/storefront/application/send-order-confirmation";
import { logAudit } from "@/shared/audit/log-audit";
import { ExternalApiError } from "@/shared/errors/app-error";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

interface PaytrCreds {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  testMode: "0" | "1";
}

function paytrCreds(): PaytrCreds | null {
  const merchantId = env.PAYTR_MERCHANT_ID;
  const merchantKey = env.PAYTR_MERCHANT_KEY;
  const merchantSalt = env.PAYTR_MERCHANT_SALT;
  if (!merchantId || !merchantKey || !merchantSalt) return null;
  return { merchantId, merchantKey, merchantSalt, testMode: env.PAYTR_TEST_MODE };
}

/** True when PayTR merchant credentials are present (card checkout available). */
export function isPaytrEnabled(): boolean {
  return paytrCreds() !== null;
}

/**
 * Verify the `t` parameter on a card-return URL (see `signOrderReturnToken`).
 *
 * The storefront's return page uses this to authorize re-reading a GUEST
 * order's payment state — possession of the return URL stands in for the
 * session it doesn't have. False whenever PayTR isn't configured, so a
 * misconfigured deployment can't accidentally authorize anything.
 */
export function verifyPaytrReturnToken(orderNumber: string, token: string): boolean {
  const creds = paytrCreds();
  if (!creds) return false;
  return verifyOrderReturnToken(
    token,
    orderNumber,
    creds.merchantKey,
    creds.merchantSalt,
  );
}

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  /** Total charge in kuruş (must equal the order total). */
  amountMinor: number;
  email: string;
  userName: string;
  userAddress: string;
  userPhone: string;
  userIp: string;
  basket: readonly BasketLine[];
  /** Timestamp for a unique merchant_oid (pass Date.now()). */
  nowMs: number;
}

/** Sign + request a PayTR token and return the hosted-payment URL to redirect to. */
export async function createPaytrPaymentSession(
  input: CreatePaymentInput,
): Promise<Result<{ paymentUrl: string }, ExternalApiError>> {
  const creds = paytrCreds();
  if (!creds) {
    return err(new ExternalApiError({ message: "Ödeme altyapısı yapılandırılmadı." }));
  }

  const merchantOid = merchantOidFor(input.orderId, input.nowMs);
  const userBasket = encodeBasket(input.basket);
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const returnToken = signOrderReturnToken(
    input.orderNumber,
    creds.merchantKey,
    creds.merchantSalt,
  );

  const paytrToken = computePaytrToken(
    {
      merchantId: creds.merchantId,
      userIp: input.userIp,
      merchantOid,
      email: input.email,
      paymentAmount: input.amountMinor,
      userBasket,
      noInstallment: "0",
      maxInstallment: "0",
      currency: "TL",
      testMode: creds.testMode,
    },
    creds.merchantKey,
    creds.merchantSalt,
  );

  const tokenRes = await requestPaytrToken({
    merchant_id: creds.merchantId,
    user_ip: input.userIp,
    merchant_oid: merchantOid,
    email: input.email,
    payment_amount: input.amountMinor,
    paytr_token: paytrToken,
    user_basket: userBasket,
    no_installment: "0",
    max_installment: "0",
    currency: "TL",
    test_mode: creds.testMode,
    user_name: input.userName,
    user_address: input.userAddress,
    user_phone: input.userPhone,
    // `t` lets the return page re-read this order's payment state while the
    // callback is still in flight, including for a guest with no session.
    merchant_ok_url: `${appUrl}/odeme/basarili?no=${encodeURIComponent(input.orderNumber)}&t=${returnToken}`,
    merchant_fail_url: `${appUrl}/odeme/basarisiz?no=${encodeURIComponent(input.orderNumber)}`,
  });
  if (!tokenRes.ok) return err(tokenRes.error);

  return ok({ paymentUrl: `https://www.paytr.com/odeme/guvenli/${tokenRes.value}` });
}

export type CallbackOutcome = { ok: true } | { ok: false; reason: string };

/** Verify a PayTR result notification and update the order. */
export async function handlePaytrCallback(payload: {
  merchant_oid: string;
  status: string;
  total_amount: string;
  hash: string;
  /** Present only on a failed notification; PayTR omits them on success. */
  failed_reason_code?: string | undefined;
  failed_reason_msg?: string | undefined;
}): Promise<CallbackOutcome> {
  const creds = paytrCreds();
  if (!creds) return { ok: false, reason: "not_configured" };

  const valid = verifyCallbackHash(
    payload.hash,
    payload.merchant_oid,
    payload.status,
    payload.total_amount,
    creds.merchantKey,
    creds.merchantSalt,
  );
  if (!valid) {
    logger.warn({ merchantOid: payload.merchant_oid }, "paytr_callback_bad_hash");
    return { ok: false, reason: "bad_hash" };
  }

  const orderId = orderIdFromMerchantOid(payload.merchant_oid);
  if (!orderId) {
    logger.warn({ merchantOid: payload.merchant_oid }, "paytr_callback_bad_oid");
    return { ok: false, reason: "bad_oid" };
  }

  if (payload.status !== "success") {
    // The order is simply still unpaid, which payment_status already says —
    // and that column is ledger-derived, so writing 'failed' onto it would be
    // erased by the next recompute. The attempt is recorded as an event
    // instead, where it can't rot.
    logger.info(
      {
        orderId,
        code: payload.failed_reason_code,
        reason: payload.failed_reason_msg,
      },
      "paytr_payment_failed",
    );
    await logAudit({
      actor_id: null, // webhook — no signed-in actor
      action: "payment.card_failed",
      entity_type: "order",
      entity_id: orderId,
      after: {
        merchant_oid: payload.merchant_oid,
        failed_reason_code: payload.failed_reason_code ?? null,
        failed_reason_msg: payload.failed_reason_msg ?? null,
      },
    });
    return { ok: true };
  }

  const recorded = await recordCardPayment({
    orderId,
    merchantOid: payload.merchant_oid,
    paidAmountMinor: Number(payload.total_amount),
  });
  if (!recorded.ok) {
    // Don't acknowledge — PayTR retrying is exactly what we want after a
    // transient DB failure on a payment that really went through.
    logger.error({ orderId, code: recorded.error.code }, "paytr_record_payment_failed");
    return { ok: false, reason: "db_error" };
  }

  if (recorded.value === "amount_mismatch") {
    // Money was taken but does not match the order total, so nothing was
    // booked and the order stays unpaid. Acknowledge (a retry would only
    // repeat the mismatch) and raise it loudly for manual reconciliation.
    logger.error(
      { orderId, merchantOid: payload.merchant_oid, paid: payload.total_amount },
      "paytr_amount_mismatch_unbooked",
    );
    await logAudit({
      actor_id: null,
      action: "payment.card_amount_mismatch",
      entity_type: "order",
      entity_id: orderId,
      after: {
        merchant_oid: payload.merchant_oid,
        paid_amount_minor: Number(payload.total_amount),
      },
    });
    return { ok: true };
  }

  logger.info({ orderId, outcome: recorded.value }, "paytr_payment_result");

  // Only on the FIRST booking: a retried notification must not re-send the
  // receipt. The card path can't send this inline — placeOrder redirects to
  // PayTR long before the payment is known to have succeeded.
  if (recorded.value === "recorded") {
    const outcome = await sendOrderConfirmationEmail(orderId);
    logger.info({ orderId, outcome }, "paytr_confirmation_email");
  }

  return { ok: true };
}
