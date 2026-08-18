/**
 * Pure PayTR (iFrame API) crypto + encoding. No I/O, no env — everything the
 * integration's correctness hinges on lives here and is unit-tested. See
 * https://dev.paytr.com/iframe-api.
 *
 * Two HMAC-SHA256 (base64) tokens:
 *  - get-token: HMAC over (merchant_id + user_ip + merchant_oid + email +
 *    payment_amount + user_basket + no_installment + max_installment +
 *    currency + test_mode + merchant_salt), keyed by merchant_key.
 *  - callback: HMAC over (merchant_oid + merchant_salt + status +
 *    total_amount), keyed by merchant_key — verified before trusting a
 *    payment-result notification.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function base64Hmac(data: string, key: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("base64");
}

export interface PaytrTokenFields {
  merchantId: string;
  userIp: string;
  merchantOid: string;
  email: string;
  /** Total charge in kuruş (integer). */
  paymentAmount: number;
  /** base64 of the PayTR basket (see encodeBasket). */
  userBasket: string;
  noInstallment: "0" | "1";
  maxInstallment: string; // "0" = no cap
  currency: "TL";
  testMode: "0" | "1";
}

/** The `paytr_token` sent to the get-token endpoint. */
export function computePaytrToken(
  f: PaytrTokenFields,
  merchantKey: string,
  merchantSalt: string,
): string {
  const hashStr =
    f.merchantId +
    f.userIp +
    f.merchantOid +
    f.email +
    String(f.paymentAmount) +
    f.userBasket +
    f.noInstallment +
    f.maxInstallment +
    f.currency +
    f.testMode;
  return base64Hmac(hashStr + merchantSalt, merchantKey);
}

/** The expected `hash` on a payment-result callback. */
export function computeCallbackHash(
  merchantOid: string,
  status: string,
  totalAmount: string,
  merchantKey: string,
  merchantSalt: string,
): string {
  return base64Hmac(
    merchantOid + merchantSalt + status + totalAmount,
    merchantKey,
  );
}

/** Constant-time verification of a callback's `hash`. */
export function verifyCallbackHash(
  receivedHash: string,
  merchantOid: string,
  status: string,
  totalAmount: string,
  merchantKey: string,
  merchantSalt: string,
): boolean {
  const expected = computeCallbackHash(
    merchantOid,
    status,
    totalAmount,
    merchantKey,
    merchantSalt,
  );
  const a = Buffer.from(receivedHash);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface BasketLine {
  /** Human-readable label, e.g. "Yumurta × 2". */
  label: string;
  /** Line total in kuruş. */
  totalMinor: number;
}

/**
 * base64 of the PayTR basket: `[[label, "TL.KK", 1], …]`. We fold quantity into
 * a single line total (qty 1) so the basket sum exactly equals payment_amount —
 * no rounding drift from tiered per-unit prices.
 */
export function encodeBasket(lines: readonly BasketLine[]): string {
  const arr = lines.map((l) => [l.label, (l.totalMinor / 100).toFixed(2), 1]);
  return Buffer.from(JSON.stringify(arr), "utf8").toString("base64");
}

/**
 * A unique, alphanumeric merchant_oid that encodes the order id: the order
 * UUID's 32 hex chars + a base36 timestamp suffix (so retries get a fresh oid
 * while still mapping back to the order).
 */
export function merchantOidFor(orderId: string, timestampMs: number): string {
  return orderId.replace(/-/g, "") + timestampMs.toString(36);
}

/** Recover the order UUID from a merchant_oid, or null if malformed. */
export function orderIdFromMerchantOid(merchantOid: string): string | null {
  const hex = merchantOid.slice(0, 32);
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A signed proof that WE issued a card-return URL for this order number.
 *
 * PayTR redirects the browser to `merchant_ok_url` before — or in a race with —
 * the server-to-server callback that actually books the payment, so the return
 * page has to be able to re-read the order's payment state until the booking
 * lands. For a logged-in customer the session scopes that read; a GUEST has no
 * session, and `order_number` alone is sequential and guessable, so reading by
 * order number alone would hand out an enumerable "is it paid?" oracle.
 *
 * This token closes that: only a URL we handed to PayTR carries a valid one, so
 * the guest read is authorized by possession of the return URL rather than by
 * the order number. Keyed by the merchant secrets — they exist exactly when
 * card payments do, so no new secret has to be provisioned.
 *
 * Deliberately NOT an expiring token: PayTR's own `timeout_limit` bounds the
 * session, and an expired token would strand a customer who left the tab open
 * through 3-D Secure — the failure mode this whole change is fixing.
 */
export function signOrderReturnToken(
  orderNumber: string,
  merchantKey: string,
  merchantSalt: string,
): string {
  return base64Hmac(`return:${orderNumber}:${merchantSalt}`, merchantKey)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Constant-time check of a token produced by `signOrderReturnToken`. */
export function verifyOrderReturnToken(
  token: string,
  orderNumber: string,
  merchantKey: string,
  merchantSalt: string,
): boolean {
  const expected = signOrderReturnToken(orderNumber, merchantKey, merchantSalt);
  // timingSafeEqual throws on a length mismatch, so guard before comparing —
  // the length itself is not a secret.
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(expected, "utf8"));
}
