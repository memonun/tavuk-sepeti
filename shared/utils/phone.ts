/**
 * Turkish phone number normalization + display.
 *
 * Storage shape is E.164 (+90...). Inputs come in many flavors: 0532 …,
 * 532 …, 90 532 …, paste from WhatsApp, etc. `normalizeTRPhone` is the
 * single chokepoint that turns user input into the canonical form before it
 * hits the DB.
 *
 * Returns `null` on invalid input — callers (Zod, repository writes) decide
 * what to do.
 */

const E164_TR = /^\+90[1-9][0-9]{9}$/;

/** Strict E.164 check used by the customers schema's CHECK constraint shadow. */
export function isE164TR(value: string): boolean {
  return E164_TR.test(value);
}

/**
 * Normalize a TR mobile or landline to +90... E.164. Accepts:
 *   "+90 532 123 45 67", "0532 123 45 67", "532 123 45 67", "905321234567"
 * Returns null if the cleaned digits don't match a 10-digit subscriber
 * number with a non-zero leading digit.
 */
export function normalizeTRPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return null;

  // Strip leading country / trunk prefixes — accept either or both.
  let subscriber = digits;
  if (subscriber.startsWith("90")) subscriber = subscriber.slice(2);
  if (subscriber.startsWith("0")) subscriber = subscriber.slice(1);

  if (!/^[1-9]\d{9}$/.test(subscriber)) return null;
  return `+90${subscriber}`;
}

/** `+905321234567` → `+90 532 123 45 67` for display. `null` → `"—"`. */
export function formatTRPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  if (!isE164TR(e164)) return e164;
  const s = e164.slice(3); // drop +90
  const a = s.slice(0, 3);
  const b = s.slice(3, 6);
  const c = s.slice(6, 8);
  const d = s.slice(8, 10);
  return `+90 ${a} ${b} ${c} ${d}`;
}

/**
 * Group a phone number AS IT IS TYPED: `05321234567` → `0532 123 45 67`.
 *
 * For the storefront's phone field. A long run of digits is hard to check by
 * eye, and the groups are how a Turkish number is read aloud, so a customer can
 * see a missing or doubled digit before submitting. Keeps the prefix the
 * customer chose (`0…`, `+90…`, or none) and stops at a full number's length.
 * Display only — `normalizeTRPhone` still decides what is stored.
 */
export function formatTRPhoneInput(input: string): string {
  const trimmed = input.trimStart();
  const digits = trimmed.replace(/\D/g, "");
  const plus = trimmed.startsWith("+");
  if (digits === "") return plus ? "+" : "";

  let prefix = "";
  let subscriber = digits;
  if (plus) {
    if (digits.length <= 2) return `+${digits}`;
    prefix = `+${digits.slice(0, 2)} `;
    subscriber = digits.slice(2);
  } else if (digits.startsWith("0")) {
    prefix = "0";
    subscriber = digits.slice(1);
  }

  subscriber = subscriber.slice(0, 10);
  const groups = [
    subscriber.slice(0, 3),
    subscriber.slice(3, 6),
    subscriber.slice(6, 8),
    subscriber.slice(8, 10),
  ].filter((group) => group !== "");
  return `${prefix}${groups.join(" ")}`;
}
