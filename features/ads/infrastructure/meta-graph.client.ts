import "server-only";

/**
 * Minimal Graph API client for the Marketing API. Every response is parsed
 * with a Zod schema (CLAUDE.md §3); nothing here logs the access token or a
 * URL that carries it.
 *
 * Errors:
 *   - Meta rejected the request itself (code 100, a parameter it does not
 *     accept — "budget too low", "invalid targeting"): BUSINESS_RULE_VIOLATION
 *     with Meta's user-facing message, so the model can correct and retry.
 *   - Token invalid / expired (190), permissions (10, 200-299): FORBIDDEN with a
 *     plain Turkish explanation for the owner.
 *   - Throttled (4, 17, 32, 613, 80000-80014): RATE_LIMITED.
 *   - Anything else: EXTERNAL_API_ERROR (masked from the model, logged here).
 */
import { z } from "zod";

import { metaErrorSchema, metaPageSchema } from "@/features/ads/domain/meta-ads";
import { AppError, ExternalApiError, ForbiddenError, RateLimitedError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

import type { MetaAdsConfig } from "./meta-ads-config";

const GRAPH_HOST = "graph.facebook.com";
const TIMEOUT_MS = 15_000;
/** 10 pages × up to 100 items: far past this account's size, bounded anyway. */
const MAX_PAGES = 10;

export type GraphParams = Readonly<Record<string, string>>;

function toAppError(status: number, body: unknown, context: { readonly method: string; readonly path: string }): AppError {
  const parsed = metaErrorSchema.safeParse(body);
  const meta = parsed.success ? parsed.data.error : null;
  logger.error(
    {
      ...context,
      status,
      metaCode: meta?.code,
      metaSubcode: meta?.error_subcode,
      metaType: meta?.type,
      metaMessage: meta?.message,
      fbtraceId: meta?.fbtrace_id,
    },
    "meta_graph_request_failed",
  );

  const code = meta?.code;
  if (code === 190 || code === 10 || (code !== undefined && code >= 200 && code < 300)) {
    return new ForbiddenError({
      message: "Meta erişim anahtarı geçersiz, süresi dolmuş ya da bu işlem için izni yok. Sistem kullanıcısının token'ını ve izinlerini kontrol edin.",
    });
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || (code !== undefined && code >= 80000 && code <= 80014)) {
    return new RateLimitedError({ message: "Meta istek sınırına takıldı. Birkaç dakika sonra tekrar deneyin." });
  }
  if (code === 100 && meta) {
    return new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, {
      message: `Meta isteği reddetti: ${meta.error_user_msg ?? meta.error_user_title ?? meta.message}`,
    });
  }
  return new ExternalApiError({ message: "Meta'ya ulaşılamadı ya da beklenmeyen bir yanıt geldi." });
}

async function send(
  url: URL,
  init: RequestInit,
  context: { readonly method: string; readonly path: string },
): Promise<Result<unknown, AppError>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (cause) {
    logger.error({ ...context, cause: cause instanceof Error ? cause.name : "unknown" }, "meta_graph_network_failed");
    return err(new ExternalApiError({ message: "Meta'ya ulaşılamadı." }));
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error page: handled as a failed request below.
  }
  if (!response.ok) return err(toAppError(response.status, body, context));
  return ok(body);
}

function graphUrl(config: MetaAdsConfig, path: string): URL {
  return new URL(`https://${GRAPH_HOST}/${config.apiVersion}/${path.replace(/^\//, "")}`);
}

function parse<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
  context: { readonly method: string; readonly path: string },
): Result<z.infer<T>, AppError> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    logger.error({ ...context, issues: parsed.error.issues.map((issue) => issue.path.join(".")) }, "meta_graph_response_invalid");
    return err(new ExternalApiError({ message: "Meta'dan beklenmeyen bir yanıt geldi." }));
  }
  return ok(parsed.data);
}

export async function graphGet<T extends z.ZodTypeAny>(
  config: MetaAdsConfig,
  path: string,
  params: GraphParams,
  schema: T,
): Promise<Result<z.infer<T>, AppError>> {
  const context = { method: "GET", path };
  const url = graphUrl(config, path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", config.accessToken);
  const body = await send(url, { method: "GET" }, context);
  return body.ok ? parse(schema, body.value, context) : body;
}

/** GET a list edge and follow Meta's paging links (same host only, bounded). */
export async function graphGetAll<T extends z.ZodTypeAny>(
  config: MetaAdsConfig,
  path: string,
  params: GraphParams,
  itemSchema: T,
): Promise<Result<Array<z.infer<T>>, AppError>> {
  const context = { method: "GET", path };
  const pageSchema = metaPageSchema(itemSchema);
  const first = await graphGet(config, path, { limit: "100", ...params }, pageSchema);
  if (!first.ok) return first;

  const items: Array<z.infer<T>> = [...first.value.data];
  let next = first.value.paging?.next;
  for (let page = 1; next && page < MAX_PAGES; page += 1) {
    const url = new URL(next);
    if (url.hostname !== GRAPH_HOST) break;
    const body = await send(url, { method: "GET" }, context);
    if (!body.ok) return body;
    const parsed = parse(pageSchema, body.value, context);
    if (!parsed.ok) return parsed;
    items.push(...parsed.value.data);
    next = parsed.value.paging?.next;
  }
  return ok(items);
}

/** POST form fields (Meta's documented encoding for Marketing API writes). */
export async function graphPost<T extends z.ZodTypeAny>(
  config: MetaAdsConfig,
  path: string,
  params: GraphParams,
  schema: T,
): Promise<Result<z.infer<T>, AppError>> {
  const context = { method: "POST", path };
  const form = new URLSearchParams(params);
  form.set("access_token", config.accessToken);
  const body = await send(graphUrl(config, path), { method: "POST", body: form }, context);
  return body.ok ? parse(schema, body.value, context) : body;
}
