/**
 * The fixed accent palette a calendar or a reminder list can take — the system
 * colors of Apple's Calendar/Reminders. Stored by NAME (the DB CHECK on
 * calendars.color / reminder_lists.color lists exactly these), resolved to a
 * hex here, so the palette can be retuned without touching a row.
 *
 * One hex per color for both themes on purpose: these are identity colors (a
 * dot, a chip tint, a checkbox ring), never text-on-background pairs, and each
 * is legible on the light and the dark surface.
 */
export const ACCENT_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
  "brown",
  "gray",
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number];

export const ACCENT_COLOR_HEX: Readonly<Record<AccentColor, string>> = {
  red: "#FF3B30",
  orange: "#FF9500",
  yellow: "#E6B800",
  green: "#34C759",
  teal: "#30B0C7",
  blue: "#007AFF",
  indigo: "#5856D6",
  purple: "#AF52DE",
  pink: "#FF2D55",
  brown: "#A2845E",
  gray: "#8E8E93",
};

export const ACCENT_COLOR_LABELS: Readonly<Record<AccentColor, string>> = {
  red: "Kırmızı",
  orange: "Turuncu",
  yellow: "Sarı",
  green: "Yeşil",
  teal: "Turkuaz",
  blue: "Mavi",
  indigo: "Çivit",
  purple: "Mor",
  pink: "Pembe",
  brown: "Kahverengi",
  gray: "Gri",
};

export function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === "string" && (ACCENT_COLORS as readonly string[]).includes(value);
}

/** A row's stored color, tolerating a value this build doesn't know (a newer
 *  palette entry read by older code during a deploy window). */
export function toAccentColor(value: unknown): AccentColor {
  return isAccentColor(value) ? value : "blue";
}

/** The accent as a translucent fill — `alpha` 0..1 → 8-digit hex. */
export function accentTint(color: AccentColor, alpha: number): string {
  const clamped = Math.min(1, Math.max(0, alpha));
  const byte = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return `${ACCENT_COLOR_HEX[color]}${byte}`;
}
