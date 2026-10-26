/**
 * Code 128 barcode encoder for the Aras Kargo label. Pure: it returns bar and
 * space widths (in modules); the UI draws them as SVG.
 *
 * Our Aras codes are digits, so they use code set C (two digits per symbol,
 * shortest barcode); an odd last digit switches to set B. Anything else uses
 * set B (printable ASCII). Written here rather than pulled in as a package:
 * the whole symbology is this table plus a checksum.
 */

/** Bar/space widths per symbol value 0–105, then stop (106). Bar first. */
const PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const STOP = 106;

/** Exposed for tests: the symbol table must stay well-formed. */
export const CODE128_PATTERNS = PATTERNS;

/** Symbol values (start, data, checksum, stop) for `value`, or null if it
 *  has characters Code 128 set B can't carry. */
export function code128Symbols(value: string): number[] | null {
  if (value.length === 0) return null;
  const symbols: number[] = [];

  if (/^[0-9]{2,}$/.test(value)) {
    symbols.push(START_C);
    let i = 0;
    for (; i + 1 < value.length; i += 2) symbols.push(Number(value.slice(i, i + 2)));
    if (i < value.length) symbols.push(CODE_B, value.charCodeAt(i) - 32);
  } else {
    symbols.push(START_B);
    for (const ch of value) {
      const code = ch.charCodeAt(0);
      if (code < 32 || code > 126) return null;
      symbols.push(code - 32);
    }
  }

  const checksum =
    symbols.reduce((sum, symbol, index) => sum + symbol * Math.max(index, 1), 0) % 103;
  symbols.push(checksum, STOP);
  return symbols;
}

/** Alternating bar/space widths in modules (first entry is a bar). */
export function code128Widths(value: string): number[] | null {
  const symbols = code128Symbols(value);
  if (!symbols) return null;
  return symbols.flatMap((symbol) => [...(PATTERNS[symbol] ?? "")].map(Number));
}
