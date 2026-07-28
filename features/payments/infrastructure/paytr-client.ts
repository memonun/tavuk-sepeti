/**
 * PayTR get-token HTTP client. Posts the (already-signed) token request and
 * returns the iframe token, or a Turkish-facing error. Server-only — never runs
 * in the browser (holds no secret itself, but the caller does).
 */
import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

const GET_TOKEN_URL = "https://www.paytr.com/odeme/api/get-token";

export interface PaytrTokenRequest {
  merchant_id: string;
  user_ip: string;
  merchant_oid: string;
  email: string;
  payment_amount: number;
  paytr_token: string;
  user_basket: string;
  no_installment: string;
  max_installment: string;
  currency: string;
  test_mode: string;
  user_name: string;
  user_address: string;
  user_phone: string;
  merchant_ok_url: string;
  merchant_fail_url: string;
}

export async function requestPaytrToken(
  req: PaytrTokenRequest,
): Promise<Result<string, ExternalApiError>> {
  const body = new URLSearchParams({
    merchant_id: req.merchant_id,
    user_ip: req.user_ip,
    merchant_oid: req.merchant_oid,
    email: req.email,
    payment_amount: String(req.payment_amount),
    paytr_token: req.paytr_token,
    user_basket: req.user_basket,
    no_installment: req.no_installment,
    max_installment: req.max_installment,
    currency: req.currency,
    test_mode: req.test_mode,
    non_3d: "0",
    user_name: req.user_name,
    user_address: req.user_address,
    user_phone: req.user_phone,
    merchant_ok_url: req.merchant_ok_url,
    merchant_fail_url: req.merchant_fail_url,
    timeout_limit: "30",
    debug_on: "1",
    lang: "tr",
  });

  try {
    const res = await fetch(GET_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as {
      status?: string;
      token?: string;
      reason?: string;
    };
    if (json.status === "success" && json.token) return ok(json.token);
    logger.error({ reason: json.reason }, "paytr_get_token_failed");
    return err(
      new ExternalApiError({ message: json.reason ?? "PayTR token alınamadı." }),
    );
  } catch (cause) {
    logger.error(
      { message: cause instanceof Error ? cause.message : "unknown" },
      "paytr_get_token_exception",
    );
    return err(new ExternalApiError({ message: "PayTR bağlantı hatası.", cause }));
  }
}
