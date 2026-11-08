import "server-only";

/**
 * Meta Conversions API sender — one POST to `/{pixel id}/events`.
 *
 * Configuration, read lazily like meta-ads-config.ts (a typo must never take
 * the shop down at boot; it only means "not configured"):
 *   NEXT_PUBLIC_META_PIXEL_ID   the Pixel (= dataset) the browser already uses
 *   META_CAPI_ACCESS_TOKEN      Events Manager → Settings → Conversions API →
 *                               "Generate access token". SECRET, server-only.
 *   META_CAPI_TEST_EVENT_CODE   optional; while set, events show under "Test
 *                               events" in Events Manager. Remove after testing.
 *   META_GRAPH_API_VERSION      optional, shared with the ads client; v26.0
 *
 * The token travels in the request BODY, never the URL, and is never logged.
 */
import { z } from "zod";

import { getMetaPixelId } from "@/shared/analytics/meta-pixel-config";
import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

import type { MetaServerEvent } from "@/features/storefront/domain/meta-purchase-event";

const TIMEOUT_MS = 5_000;

const configSchema = z.object({
  pixelId: z.string().regex(/^\d{8,20}$/),
  accessToken: z.string().trim().min(20),
  testEventCode: z.string().trim().regex(/^[A-Za-z0-9]{1,64}$/).optional(),
  apiVersion: z.string().trim().regex(/^v\d+\.\d+$/).default("v26.0"),
});

type MetaConversionsConfig = z.infer<typeof configSchema>;

const blank = (value: string | undefined) => (value && value.trim() !== "" ? value : undefined);

/** null = not configured (or malformed — logged without values). */
function getConfig(): MetaConversionsConfig | null {
  const raw = {
    pixelId: getMetaPixelId() ?? undefined,
    accessToken: blank(process.env.META_CAPI_ACCESS_TOKEN),
    testEventCode: blank(process.env.META_CAPI_TEST_EVENT_CODE),
    apiVersion: blank(process.env.META_GRAPH_API_VERSION),
  };
  if (!raw.accessToken || !raw.pixelId) return null;
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error({ fields: parsed.error.issues.map((issue) => issue.path.join(".")) }, "meta_capi_config_invalid");
    return null;
  }
  return parsed.data;
}

export function isMetaConversionsEnabled(): boolean {
  return getConfig() !== null;
}

const successSchema = z.object({ events_received: z.number().int() });
const errorSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    type: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
    fbtrace_id: z.string().optional(),
  }),
});

/** Sends one event. `skipped` when the Conversions API is not configured. */
export async function sendMetaServerEvent(
  event: MetaServerEvent,
): Promise<Result<"sent" | "skipped", ExternalApiError>> {
  const config = getConfig();
  if (!config) return ok("skipped");

  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/${config.pixelId}/events`);
  const body = {
    data: [event],
    access_token: config.accessToken,
    ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (cause) {
    logger.error({ cause: cause instanceof Error ? cause.name : "unknown" }, "meta_capi_network_failed");
    return err(new ExternalApiError({ message: "Meta'ya ulaşılamadı." }));
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Parsed as "unexpected response" below.
  }

  const success = successSchema.safeParse(json);
  if (response.ok && success.success && success.data.events_received >= 1) return ok("sent");

  const failure = errorSchema.safeParse(json);
  const meta = failure.success ? failure.data.error : null;
  logger.error(
    {
      status: response.status,
      metaCode: meta?.code,
      metaSubcode: meta?.error_subcode,
      metaType: meta?.type,
      metaMessage: meta?.message,
      fbtraceId: meta?.fbtrace_id,
    },
    "meta_capi_request_failed",
  );
  return err(new ExternalApiError({ message: "Meta satış bildirimini kabul etmedi." }));
}
