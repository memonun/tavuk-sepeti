/**
 * The panel's text size — a per-device choice for whoever holds the phone (the
 * panel is shared by people with different eyesight). It scales the document's
 * root font size, so every rem-sized piece of the panel (text, buttons, rows,
 * the tab bar) grows together and nothing has to be re-laid out by hand.
 *
 * Kept in a cookie, not localStorage, so the server renders the chosen size on
 * the very first paint — no flash of small text before a script runs.
 *
 * No "use client" here: the admin layout (a server component) reads the cookie
 * through these helpers.
 */
export const TEXT_SIZES = ["normal", "large", "xlarge"] as const;

export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_COOKIE = "admin-text-size";

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  normal: "Normal",
  large: "Büyük",
  xlarge: "En büyük",
};

export function parseTextSize(value: string | undefined): TextSize {
  return TEXT_SIZES.find((size) => size === value) ?? "normal";
}
