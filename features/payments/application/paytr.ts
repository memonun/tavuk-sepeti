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
  verifyCallbackHash,
  type BasketLine,
} from "@/features/payments/domain/paytr";
import { requestPaytrToken } from "@/features/payments/infrastructure/paytr-client";
import {
  markOrderPaidIfAmountMatches,
  markOrderPaymentFailed,
} from "@/features/payments/infrastructure/payment.repository";
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
    merchant_ok_url: `${appUrl}/odeme/basarili?no=${encodeURIComponent(input.orderNumber)}`,
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

  if (payload.status === "success") {
    const r = await markOrderPaidIfAmountMatches(orderId, Number(payload.total_amount));
    if (!r.ok) {
      logger.error({ orderId, code: r.error.code }, "paytr_mark_paid_failed");
      return { ok: false, reason: "db_error" };
    }
    logger.info({ orderId, outcome: r.value }, "paytr_payment_result");
  } else {
    const r = await markOrderPaymentFailed(orderId);
    if (!r.ok) {
      logger.error({ orderId }, "paytr_mark_failed_failed");
      return { ok: false, reason: "db_error" };
    }
    logger.info({ orderId }, "paytr_payment_failed");
  }
  return { ok: true };
}
