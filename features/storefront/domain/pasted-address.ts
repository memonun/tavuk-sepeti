/**
 * A pasted Turkish address, split into the checkout's address fields.
 *
 * Owner request 2026-10-20: a customer who pastes their open address ("Fırat
 * Mah. 19. Sk. No:39/3 Battalgazi/Malatya") should get the fields filled for
 * them and only check them or add what is missing. Most of our customers are
 * 50+, and eight separate boxes are where they give up.
 *
 * Pure, local and deterministic — no Google call, so no quota and no network
 * wait (CLAUDE.md §8). It reads the conventions Turkish addresses are written
 * in: "Mah./Mahallesi", "Cad./Sk./Sokak/Bulvarı", "No:12/3", "D:3", "Kat 2",
 * a five-digit postal code and "İlçe/İl" (or the province at the end). What it
 * cannot place goes to "Adres tarifi" rather than being dropped. It only ever
 * proposes: the customer sees every field and fixes what it got wrong.
 *
 * No lookbehind in these patterns on purpose: older iPhones (iOS < 16.4) throw
 * on it at load time, which would take the whole checkout down with it.
 */
import { findTurkishProvince, normalizeProvince } from "@/shared/geo/tr-province";

export type PastedAddressField =
  | "city"
  | "district"
  | "neighborhood"
  | "street"
  | "building_no"
  | "apartment_no"
  | "postal_code"
  | "description";

export type PastedAddress = Partial<Record<PastedAddressField, string>>;

const NEIGHBORHOOD_WORDS = new Set(["mahallesi", "mahalle", "mah", "mh"]);
const STREET_WORDS = new Set([
  "caddesi", "cadde", "cad", "cd",
  "sokagi", "sokak", "sok", "sk",
  "bulvari", "bulvar", "blv", "bulv",
]);
const NOISE_WORDS = new Set(["turkiye", "turkey", "tr"]);

/** Word-boundary that understands Turkish letters (`\b` does not). */
const EDGE = "(^|[^\\p{L}\\d])";
const END = "(?=$|[^\\p{L}\\d])";
const UNIT = "(\\d+[a-zçğıöşü]?)";
/** "daire" in any case: the `i` flag does not fold Turkish İ/ı to i. */
const DAIRE = "da[iİıI]re";

const DOOR = new RegExp(
  `${EDGE}(?:no|numara)\\s*[:.]?\\s*${UNIT}(?:\\s*\\/\\s*${UNIT})?(?:\\s*(?:${DAIRE}|d)\\s*[:.]?\\s*${UNIT})?${END}`,
  "iu",
);
const APARTMENT = new RegExp(`${EDGE}(?:${DAIRE}\\s*[:.]?|d\\s*[:.])\\s*${UNIT}${END}`, "iu");
const FLOOR = new RegExp(`${EDGE}kat\\s*[:.]?\\s*(\\d+)${END}`, "iu");
const POSTAL = /(^|\D)((?:0[1-9]|[1-7]\d|8[01])\d{3})(?=$|\D)/u;
const DISTRICT_SLASH_CITY = /(^|[^\p{L}])(\p{L}+)\s*\/\s*(\p{L}+)(?=$|[^\p{L}])/gu;

const fold = (token: string): string => normalizeProvince(token.replace(/[.,:;]+$/u, ""));
const isKeyword = (token: string): boolean => {
  const key = fold(token);
  return NEIGHBORHOOD_WORDS.has(key) || STREET_WORDS.has(key);
};

/** "ÇAVUŞOĞLU MH." → "Çavuşoğlu Mh."; anything not all-caps is left as typed. */
function tidy(value: string): string {
  const trimmed = value.replace(/^[\s,:;\-–]+|[\s,:;\-–]+$/gu, "").replace(/\s+/g, " ");
  const shouting =
    /\p{L}{2}/u.test(trimmed) && trimmed === trimmed.toLocaleUpperCase("tr");
  if (!shouting) return trimmed;
  return trimmed
    .toLocaleLowerCase("tr")
    .replace(/(^|[\s/.\-])(\p{L})/gu, (_, before: string, letter: string) =>
      before + letter.toLocaleUpperCase("tr"),
    );
}

export function parsePastedAddress(text: string): PastedAddress {
  const found: Record<string, string> = {};
  let rest = ` ${text} `
    .replace(/[\r\n;]+/g, " , ")
    .replace(/(\d)\.(?=\p{L})/gu, "$1. ") // "19.Sk." → "19. Sk."
    .replace(/\s+/g, " ");

  /** Take a match out of `rest`, keeping the EDGE character it consumed. */
  const cut = (match: RegExpExecArray): void => {
    const start = match.index + (match[1] ?? "").length;
    rest = `${rest.slice(0, start)} , ${rest.slice(match.index + match[0].length)}`;
  };

  const door = DOOR.exec(rest);
  if (door) {
    if (door[2]) found.building_no = door[2].toLocaleUpperCase("tr");
    const apartment = door[3] ?? door[4];
    if (apartment) found.apartment_no = apartment.toLocaleUpperCase("tr");
    cut(door);
  }
  if (!found.apartment_no) {
    const apartment = APARTMENT.exec(rest);
    if (apartment?.[2]) {
      found.apartment_no = apartment[2].toLocaleUpperCase("tr");
      cut(apartment);
    }
  }
  let floor: string | null = null;
  const floorMatch = FLOOR.exec(rest);
  if (floorMatch?.[2]) {
    floor = floorMatch[2];
    cut(floorMatch);
  }
  const postal = POSTAL.exec(rest);
  if (postal?.[2]) {
    found.postal_code = postal[2];
    cut(postal);
  }

  // "Battalgazi/Malatya" — or the other way round.
  for (const match of rest.matchAll(DISTRICT_SLASH_CITY)) {
    const left = match[2] ?? "";
    const right = match[3] ?? "";
    const city = findTurkishProvince(right) ?? findTurkishProvince(left);
    if (!city) continue;
    found.city = city;
    const district = findTurkishProvince(right) ? left : right;
    if (district && !isKeyword(district)) found.district = district;
    cut(match as RegExpExecArray);
    break;
  }

  const tokens = rest.replace(/,/g, " , ").split(/\s+/).filter(Boolean);

  // No slash: the province is usually the last place name. One followed by
  // "Cad."/"Mah." is a street or neighbourhood named after it ("Ankara Cad.").
  if (!found.city) {
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
      const token = tokens[i] ?? "";
      const city = findTurkishProvince(token);
      const next = tokens[i + 1];
      if (!city || (next && isKeyword(next))) continue;
      found.city = city;
      tokens[i] = ",";
      const before = tokens[i - 1];
      if (
        !found.district &&
        before &&
        /^\p{L}+$/u.test(before) &&
        !isKeyword(before) &&
        !findTurkishProvince(before)
      ) {
        found.district = before;
        tokens[i - 1] = ",";
      }
      break;
    }
  }

  // The rest, left to right: the words before "Mah." name the neighbourhood,
  // the words before "Cad."/"Sk." name a street (kept with its keyword).
  let buffer: string[] = [];
  const streets: string[] = [];
  const leftovers: string[] = [];
  const flush = () => {
    if (buffer.length > 0) leftovers.push(buffer.join(" "));
    buffer = [];
  };
  for (const token of tokens) {
    const key = fold(token);
    if (token === "," || NOISE_WORDS.has(key)) {
      flush();
    } else if (NEIGHBORHOOD_WORDS.has(key)) {
      if (buffer.length > 0 && !found.neighborhood) {
        found.neighborhood = buffer.join(" ");
        buffer = [];
      } else {
        flush();
      }
    } else if (STREET_WORDS.has(key)) {
      if (buffer.length > 0) streets.push([...buffer, token].join(" "));
      buffer = [];
    } else {
      buffer.push(token);
    }
  }
  flush();
  if (streets.length > 0) found.street = streets.join(" ");

  const description = [
    floor ? `Kat ${floor}` : null,
    ...leftovers.filter((part) => /\p{L}{2}/u.test(part)),
  ].filter((part): part is string => part !== null);
  if (description.length > 0) found.description = description.join(", ");

  const result: PastedAddress = {};
  for (const [key, value] of Object.entries(found)) {
    const clean = tidy(value);
    if (clean !== "") result[key as PastedAddressField] = clean;
  }
  return result;
}
