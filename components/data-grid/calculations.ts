/**
 * Per-column footer aggregates ("calculations bar"). Notion-style: each
 * column declares — or the user picks via the header menu — one of the
 * functions below. The grid renders the result in a sticky <tfoot> row.
 *
 * Calculations run client-side over the visible page rows. For full
 * dataset aggregates we'd need server-side support; that lands in
 * Sprint 4 with the saved-views pass.
 */

export type AggregateKind =
  | "none"
  | "count_all"
  | "count_filled"
  | "count_empty"
  | "count_unique"
  | "percent_filled"
  | "percent_empty"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "range";

export const AGGREGATE_LABELS: Readonly<Record<AggregateKind, string>> = {
  none: "Yok",
  count_all: "Sayı",
  count_filled: "Dolu",
  count_empty: "Boş",
  count_unique: "Tekil",
  percent_filled: "Dolu %",
  percent_empty: "Boş %",
  sum: "Toplam",
  avg: "Ortalama",
  min: "En düşük",
  max: "En yüksek",
  range: "Aralık",
};

export const NUMERIC_AGGREGATES: ReadonlyArray<AggregateKind> = [
  "sum",
  "avg",
  "min",
  "max",
  "range",
];

const COMMON_AGGREGATES: ReadonlyArray<AggregateKind> = [
  "none",
  "count_all",
  "count_filled",
  "count_empty",
  "count_unique",
  "percent_filled",
  "percent_empty",
];

export function aggregatesForColumnType(columnType: string | undefined): ReadonlyArray<AggregateKind> {
  if (columnType === "number") {
    return [...COMMON_AGGREGATES, ...NUMERIC_AGGREGATES];
  }
  return COMMON_AGGREGATES;
}

const TR = "tr-TR";

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString(TR, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString(TR, { maximumFractionDigits: 1, minimumFractionDigits: 0 })}%`;
}

/**
 * Compute the aggregate for one column over the supplied row values.
 * Returns a display-ready string, or null when the aggregate doesn't
 * apply (e.g., sum on a text column).
 */
export function computeAggregate(
  kind: AggregateKind,
  values: ReadonlyArray<unknown>,
): string | null {
  if (kind === "none") return null;
  const total = values.length;

  switch (kind) {
    case "count_all":
      return formatNumber(total, 0);
    case "count_filled": {
      const filled = values.filter(isFilled).length;
      return formatNumber(filled, 0);
    }
    case "count_empty": {
      const empty = values.filter((v) => !isFilled(v)).length;
      return formatNumber(empty, 0);
    }
    case "count_unique": {
      const unique = new Set(values.filter(isFilled).map((v) => JSON.stringify(v)));
      return formatNumber(unique.size, 0);
    }
    case "percent_filled":
      return total === 0
        ? formatPercent(0)
        : formatPercent((values.filter(isFilled).length / total) * 100);
    case "percent_empty":
      return total === 0
        ? formatPercent(0)
        : formatPercent((values.filter((v) => !isFilled(v)).length / total) * 100);
    case "sum": {
      const numbers = values.map(asNumber).filter((n): n is number => n !== null);
      if (numbers.length === 0) return null;
      return formatNumber(numbers.reduce((a, b) => a + b, 0));
    }
    case "avg": {
      const numbers = values.map(asNumber).filter((n): n is number => n !== null);
      if (numbers.length === 0) return null;
      return formatNumber(numbers.reduce((a, b) => a + b, 0) / numbers.length);
    }
    case "min": {
      const numbers = values.map(asNumber).filter((n): n is number => n !== null);
      if (numbers.length === 0) return null;
      return formatNumber(Math.min(...numbers));
    }
    case "max": {
      const numbers = values.map(asNumber).filter((n): n is number => n !== null);
      if (numbers.length === 0) return null;
      return formatNumber(Math.max(...numbers));
    }
    case "range": {
      const numbers = values.map(asNumber).filter((n): n is number => n !== null);
      if (numbers.length === 0) return null;
      return formatNumber(Math.max(...numbers) - Math.min(...numbers));
    }
    default:
      return null;
  }
}
