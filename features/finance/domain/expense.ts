/**
 * Manual business expense — fuel, packaging, vehicle maintenance, etc.
 * Originates outside the online order flow, so unlike revenue it can't be
 * derived from `orders`; it needs its own persistent record.
 *
 * Money is kuruş (minor units), CLAUDE.md §7.
 *
 * `category` (free text) was V1's only classification — Finance V2 replaces
 * it with the managed `category_id` (features/finance/domain/expense-category.ts).
 * `category` is kept as the pre-V2 historical snapshot for rows that predate
 * the backfill migration; it is no longer written by new code and is nullable
 * at the DB level so old app code mid-deploy is unaffected either way.
 */

export type ExpensePaymentStatus = "paid" | "pending";
export type ManualPaymentMethod = "cash" | "card" | "bank_transfer" | "other";
export type ExpenseUnit = "kg" | "litre" | "adet" | "koli" | "paket" | "ton";

export interface Expense {
  readonly id: string;
  /** Historical/legacy free-text snapshot — see file header. */
  readonly category: string | null;
  readonly category_id: string | null;
  readonly amount_minor: number;
  readonly expense_date: string; // YYYY-MM-DD
  readonly description: string | null;
  readonly payment_status: ExpensePaymentStatus;
  readonly payment_method: ManualPaymentMethod | null;
  readonly vendor: string | null;
  readonly note: string | null;
  /** Optional — only meaningful together with `unit` (Birim Maliyet, spec §7). */
  readonly quantity: number | null;
  readonly unit: ExpenseUnit | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly created_by: string | null;
}

export const EXPENSE_UNIT_LABELS: Readonly<Record<ExpenseUnit, string>> = {
  kg: "kg",
  litre: "litre",
  adet: "adet",
  koli: "koli",
  paket: "paket",
  ton: "ton",
};

/** `amount_minor / quantity`, derived — never persisted (spec §7: "prefer
 *  deriving unit cost from amount / quantity"). Returns null when either
 *  input is missing, since unit cost only makes sense for the pair. */
export function calculateUnitCostMinor(
  amountMinor: number,
  quantity: number | null,
): number | null {
  if (quantity === null || quantity <= 0) return null;
  return amountMinor / quantity;
}

export const EXPENSE_PAYMENT_STATUS_LABELS: Readonly<
  Record<ExpensePaymentStatus, string>
> = {
  paid: "Ödendi",
  pending: "Ödeme Bekliyor",
};

export const MANUAL_PAYMENT_METHOD_LABELS: Readonly<
  Record<ManualPaymentMethod, string>
> = {
  cash: "Nakit",
  card: "Kart",
  bank_transfer: "Banka Transferi",
  other: "Diğer",
};
