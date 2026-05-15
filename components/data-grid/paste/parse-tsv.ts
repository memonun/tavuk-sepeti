/**
 * Excel / Google Sheets clipboard parser.
 *
 * Excel and Sheets put TSV on the clipboard (\t between cells, \n between
 * rows). Cells containing tab/newline/quote get RFC4180-style quoted with
 * doubled inner quotes. TR Windows Excel sometimes uses ; instead of \t —
 * we sniff and fall back.
 *
 * Formula injection defense (CLAUDE.md §10): cells starting with =, +, -, @
 * get prefixed with a single quote when round-tripped to clipboard. The
 * parser strips that leading quote on input so a roundtrip is identity.
 *
 * Returns a 2D array of raw strings — schema parsing happens at the column
 * level afterwards.
 */

const FORMULA_PREFIXES = new Set(["=", "+", "-", "@"]);

export interface ParseResult {
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
  readonly delimiter: "\t" | ";" | ",";
}

export function parseClipboardTable(input: string): ParseResult {
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const delimiter = sniffDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  return { rows, delimiter };
}

/**
 * Serialize a 2D table back into TSV format (Excel/Sheets compatible).
 * Cells containing the delimiter, a quote, or a newline are RFC4180-quoted.
 */
export function serializeClipboardTable(
  table: ReadonlyArray<ReadonlyArray<string>>,
): string {
  return table.map((row) => row.map(escapeCell).join("\t")).join("\n");
}

function escapeCell(value: string): string {
  // Formula injection defense — neutralize a leading formula char on
  // anything we put on the clipboard so a paste into Excel doesn't
  // execute as a formula.
  const safe =
    value.length > 0 && FORMULA_PREFIXES.has(value[0]!) ? `'${value}` : value;
  if (/[\t\n"]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function sniffDelimiter(text: string): "\t" | ";" | "," {
  // Look at the first 1-2 lines of unquoted content. If tab beats semicolon
  // beats comma, that's the delimiter. Defaults to tab — that's what Excel
  // emits 99% of the time.
  const sample = text.split("\n").slice(0, 2).join("\n");
  let inQuotes = false;
  let tabs = 0;
  let semis = 0;
  let commas = 0;
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (ch === '"') {
      // Doubled quote inside a quoted field — skip the second one.
      if (inQuotes && sample[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === "\t") tabs++;
    else if (ch === ";") semis++;
    else if (ch === ",") commas++;
  }
  if (tabs >= semis && tabs >= commas) return "\t";
  if (semis >= commas) return ";";
  return ",";
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote.
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.length === 0) {
      // Quotes only count as opening when at the start of a cell.
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      current.push(stripFormulaGuard(cell));
      cell = "";
      continue;
    }
    if (ch === "\n") {
      current.push(stripFormulaGuard(cell));
      rows.push(current);
      current = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  // Flush the trailing cell / row if the input didn't end with a newline.
  if (cell.length > 0 || current.length > 0) {
    current.push(stripFormulaGuard(cell));
    rows.push(current);
  }
  return rows;
}

function stripFormulaGuard(value: string): string {
  // Reverse the leading single-quote we add in escapeCell. Only strip if
  // followed by a formula char so we don't eat legitimate apostrophes.
  if (value.length >= 2 && value[0] === "'" && FORMULA_PREFIXES.has(value[1]!)) {
    return value.slice(1);
  }
  return value;
}
