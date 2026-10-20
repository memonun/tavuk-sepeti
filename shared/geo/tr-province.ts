/**
 * Turkish province-name comparison.
 *
 * Why this exists instead of `a.toLowerCase() === b.toLowerCase()`:
 * JavaScript's default casing rules are wrong for Turkish in both directions.
 *
 *   "İSTANBUL".toLowerCase()  →  "i̇stanbul"   (i + U+0307 COMBINING DOT ABOVE)
 *   "ISTANBUL".toLowerCase()  →  "istanbul"   (Turkish would give "ıstanbul")
 *
 * So a naive compare silently classifies İstanbul as "not İstanbul", and a
 * `toLocaleLowerCase("tr")` compare turns ASCII "Istanbul" into "ıstanbul" and
 * breaks the other way. Neither is acceptable when the answer decides whether a
 * van is dispatched.
 *
 * The fix is to fold to a canonical ASCII form rather than to "lowercase":
 * dotted and dotless i both become "i", diacritics are stripped via NFD, and the
 * result is compared. This is locale-independent and deterministic.
 *
 * NOTE: this is a convenience/pre-filter, never the authority. The authoritative
 * "can we deliver here?" test is the PostGIS point-in-polygon check against
 * `service_areas` (see is_within_service_area). Province names are only used to
 * give the customer a fast inline hint, and as the documented fallback when no
 * service area has been configured yet.
 */

/** Dotless/dotted i pairs. NFD does not decompose U+0131, so they need mapping. */
const I_FOLD: ReadonlyArray<readonly [RegExp, string]> = [
  [/ı/g, "i"], // ı  LATIN SMALL LETTER DOTLESS I
  [/İ/g, "i"], // İ  LATIN CAPITAL LETTER I WITH DOT ABOVE
  [/I/g, "i"], //     I  ASCII capital I
];

/** " ili" / " İli" — "Malatya İli" and "Malatya" are the same province. */
const PROVINCE_SUFFIX = /\s+ili$/;

/**
 * Canonical comparison form of a Turkish province name: ASCII-folded, lowercase,
 * whitespace-collapsed, with a trailing "ili" removed. Returns "" for
 * null/undefined/blank so callers can treat "no province" uniformly.
 */
export function normalizeProvince(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";

  let out = raw;
  for (const [pattern, replacement] of I_FOLD) {
    out = out.replace(pattern, replacement);
  }

  return out
    // Decompose, then drop combining marks: ğ→g, ü→u, ş→s, ö→o, ç→c, and any
    // stray U+0307 left over from a precomposed dotted capital.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(PROVINCE_SUFFIX, "")
    .trim();
}

/** True when both names denote the same Turkish province. Blank never matches. */
export function isSameProvince(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeProvince(a);
  if (left === "") return false;
  return left === normalizeProvince(b);
}

/** The 81 provinces, as they are written. */
export const TR_PROVINCES: readonly string[] = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara",
  "Antalya", "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman",
  "Bayburt", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa",
  "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Düzce", "Edirne",
  "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun",
  "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul", "İzmir",
  "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri",
  "Kilis", "Kırıkkale", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya",
  "Malatya", "Manisa", "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde",
  "Ordu", "Osmaniye", "Rize", "Sakarya", "Samsun", "Şanlıurfa", "Siirt", "Sinop",
  "Şırnak", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van",
  "Yalova", "Yozgat", "Zonguldak",
];

const PROVINCE_BY_KEY: ReadonlyMap<string, string> = new Map(
  TR_PROVINCES.map((name) => [normalizeProvince(name), name]),
);

/** The province a word names, written properly ("MALATYA" → "Malatya"), or
 *  null. Trailing punctuation is ignored. */
export function findTurkishProvince(word: string): string | null {
  return PROVINCE_BY_KEY.get(normalizeProvince(word.replace(/[.,:;]+$/u, ""))) ?? null;
}
