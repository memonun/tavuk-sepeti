/**
 * Meta Conversions API — the server-side `Purchase` event, as pure functions.
 *
 * Owner decision 2026-11-08: the browser Pixel alone lost sales (closed tab at
 * the bank, ad blockers, in-app browsers) and Meta could tie few of the ones it
 * did get to an ad. So every web order is ALSO reported from the server, with
 * the matching keys Meta asks for:
 *   - e-mail and phone, normalised and SHA-256 hashed (Meta's required form;
 *     the plain values never leave our database, and are not even stored
 *     next to the signals — only their hashes are);
 *   - Meta's own first-party cookies `_fbp` / `_fbc`, the client IP and user
 *     agent, exactly as the browser Pixel would have sent them.
 * Nothing else about the customer — no name, address or notes.
 *
 * Dedupe: `event_id` is `purchase:<order number>`, the same `eventID` the
 * browser Pixel sends (`metaEventId` in shared/analytics/meta-pixel.ts), so a
 * sale reported by both is counted once.
 */
import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { metaEventId } from "@/shared/analytics/meta-pixel";
import { normalizeTRPhone } from "@/shared/utils/phone";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Meta: trim + lowercase, then SHA-256. Null for anything not e-mail shaped. */
export function hashEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return sha256(normalized);
}

/** Meta: digits only, country code included, no "+" (905321234567). */
export function hashPhone(phone: string | null | undefined): string | null {
  const e164 = phone ? normalizeTRPhone(phone) : null;
  return e164 ? sha256(e164.slice(1)) : null;
}

/**
 * `_fbp` / `_fbc` as Meta's script writes them: `fb.<n>.<ms timestamp>.<value>`.
 * Anything else (a tampered or foreign cookie) is dropped rather than sent.
 */
export function sanitizeMetaCookie(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > 600) return null;
  return /^fb\.\d\.\d{10,13}\.[\x21-\x7e]{1,500}$/.test(trimmed) ? trimmed : null;
}

/** First address of an `x-forwarded-for` list, only if it is a real IP. */
export function sanitizeClientIp(value: string | null | undefined): string | null {
  const first = value?.split(",")[0]?.trim() ?? "";
  return isIP(first) ? first : null;
}

export function sanitizeUserAgent(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 512) : null;
}

export interface PurchaseMatchSignals {
  readonly emailHash: string | null;
  readonly phoneHash: string | null;
  readonly fbp: string | null;
  readonly fbc: string | null;
  readonly clientIp: string | null;
  readonly userAgent: string | null;
}

export interface PurchaseFacts {
  readonly orderNumber: string;
  /** Order total actually owed/charged, delivery included (kuruş). */
  readonly totalMinor: number;
  readonly items: ReadonlyArray<{ readonly productKey: string; readonly quantity: number }>;
}

export interface MetaServerEvent {
  readonly event_name: "Purchase";
  readonly event_time: number;
  readonly event_id: string;
  readonly action_source: "website";
  readonly event_source_url: string;
  readonly user_data: Readonly<Record<string, string | readonly string[]>>;
  readonly custom_data: {
    readonly currency: "TRY";
    readonly value: number;
    readonly order_id: string;
    readonly content_type: "product";
    readonly content_ids: readonly string[];
    readonly contents: ReadonlyArray<{ readonly id: string; readonly quantity: number }>;
    readonly num_items: number;
  };
}

/** Meta keeps only events at most 7 days old; older signals are pointless. */
export const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function buildMetaPurchaseEvent(input: {
  readonly purchase: PurchaseFacts;
  readonly signals: PurchaseMatchSignals;
  readonly eventTimeMs: number;
  /** Page the sale happened on — a fixed URL, never one carrying a token. */
  readonly eventSourceUrl: string;
}): MetaServerEvent {
  const { purchase, signals } = input;
  const userData: Record<string, string | readonly string[]> = {};
  if (signals.emailHash) userData.em = [signals.emailHash];
  if (signals.phoneHash) userData.ph = [signals.phoneHash];
  if (signals.fbp) userData.fbp = signals.fbp;
  if (signals.fbc) userData.fbc = signals.fbc;
  if (signals.clientIp) userData.client_ip_address = signals.clientIp;
  if (signals.userAgent) userData.client_user_agent = signals.userAgent;

  return {
    event_name: "Purchase",
    event_time: Math.floor(input.eventTimeMs / 1000),
    event_id: metaEventId("purchase", purchase.orderNumber),
    action_source: "website",
    event_source_url: input.eventSourceUrl,
    user_data: userData,
    custom_data: {
      currency: "TRY",
      value: Math.round(purchase.totalMinor) / 100,
      order_id: purchase.orderNumber,
      content_type: "product",
      content_ids: purchase.items.map((item) => item.productKey),
      contents: purchase.items.map((item) => ({ id: item.productKey, quantity: item.quantity })),
      num_items: purchase.items.length,
    },
  };
}
