/**
 * Aras Kargo shipping web service (ASMX/SOAP 1.1): SetOrder and
 * CancelDispatch. Plain `fetch` + hand-built XML — the service takes a fixed,
 * flat envelope, and the replies we read are two or three leaf tags, so a SOAP
 * library would add a dependency for no gain. Replies are Zod-parsed before
 * anyone trusts them.
 *
 * Server-only: credentials travel in the request body. Never log the body
 * (it carries the recipient's name, phone and address).
 */
import "server-only";

import { z } from "zod";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

import type { ArasOrder } from "@/features/cargo/domain/aras-order";

const ENDPOINT = {
  test: "https://customerservicestest.araskargo.com.tr/arascargoservice/arascargoservice.asmx",
  live: "https://customerws.araskargo.com.tr/arascargoservice.asmx",
} as const;

const TIMEOUT_MS = 15_000;

export interface ArasCredentials {
  readonly username: string;
  readonly password: string;
  readonly testMode: boolean;
}

export interface ArasResult {
  readonly resultCode: string;
  readonly resultMessage: string;
}

const resultSchema = z.object({
  resultCode: z.string().trim().min(1),
  resultMessage: z.string().default(""),
});

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Text of the first `<tag>` in a SOAP reply (namespace prefixes ignored). */
function readTag(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`).exec(xml);
  return match?.[1] === undefined ? undefined : unescapeXml(match[1]);
}

function el(tag: string, value: string | null): string {
  return value === null ? "" : `<${tag}>${escapeXml(value)}</${tag}>`;
}

function envelope(body: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soap:Body>${body}</soap:Body></soap:Envelope>`
  );
}

async function call(
  creds: ArasCredentials,
  action: "SetOrder" | "CancelDispatch",
  body: string,
  resultTag: "OrderResultInfo" | "CancelDispatchResult",
  context: { integrationCode: string },
): Promise<Result<ArasResult, ExternalApiError>> {
  const url = creds.testMode ? ENDPOINT.test : ENDPOINT.live;
  let xml: string;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"http://tempuri.org/${action}"`,
      },
      body: envelope(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    xml = await res.text();
    if (!res.ok) {
      logger.error(
        { action, status: res.status, fault: readTag(xml, "faultstring"), ...context },
        "aras_http_error",
      );
      return err(new ExternalApiError({ message: "Aras Kargo servisi hata döndürdü." }));
    }
  } catch (cause) {
    logger.error(
      { action, message: cause instanceof Error ? cause.message : "unknown", ...context },
      "aras_request_failed",
    );
    return err(new ExternalApiError({ message: "Aras Kargo'ya bağlanılamadı.", cause }));
  }

  const block = readTag(xml, resultTag);
  const parsed = resultSchema.safeParse({
    resultCode: block === undefined ? undefined : readTag(block, "ResultCode"),
    resultMessage: block === undefined ? undefined : readTag(block, "ResultMessage"),
  });
  if (!parsed.success) {
    logger.error({ action, ...context }, "aras_unexpected_reply");
    return err(new ExternalApiError({ message: "Aras Kargo'dan beklenmeyen cevap geldi." }));
  }

  logger.info(
    { action, resultCode: parsed.data.resultCode, testMode: creds.testMode, ...context },
    "aras_call_done",
  );
  return ok(parsed.data);
}

/**
 * Send (or re-send — Aras updates the record, up to 20 times per code) one
 * order's recipient data. Returns Aras's result; "0" means accepted.
 */
export function sendArasOrder(
  creds: ArasCredentials,
  order: ArasOrder,
): Promise<Result<ArasResult, ExternalApiError>> {
  const user = escapeXml(creds.username);
  const pass = escapeXml(creds.password);
  const body =
    '<SetOrder xmlns="http://tempuri.org/"><orderInfo><Order>' +
    `<UserName>${user}</UserName><Password>${pass}</Password>` +
    el("TradingWaybillNumber", order.tradingWaybillNumber) +
    el("ReceiverName", order.receiverName) +
    el("ReceiverAddress", order.receiverAddress) +
    el("ReceiverPhone1", order.receiverPhone) +
    el("ReceiverCityName", order.cityName) +
    el("ReceiverTownName", order.townName) +
    el("IntegrationCode", order.integrationCode) +
    el("ReceiverQuarterName", order.quarterName) +
    // 1 = sender pays (the customer already paid us the cargo fee); domestic.
    el("PayorTypeCode", "1") +
    el("IsWorldWide", "0") +
    "</Order></orderInfo>" +
    `<userName>${user}</userName><password>${pass}</password>` +
    "</SetOrder>";
  return call(creds, "SetOrder", body, "OrderResultInfo", {
    integrationCode: order.integrationCode,
  });
}

/** Delete an order Aras has not accepted at a branch yet. */
export function cancelArasDispatch(
  creds: ArasCredentials,
  integrationCode: string,
): Promise<Result<ArasResult, ExternalApiError>> {
  const body =
    '<CancelDispatch xmlns="http://tempuri.org/">' +
    el("userName", creds.username) +
    el("password", creds.password) +
    el("integrationCode", integrationCode) +
    "</CancelDispatch>";
  return call(creds, "CancelDispatch", body, "CancelDispatchResult", { integrationCode });
}
