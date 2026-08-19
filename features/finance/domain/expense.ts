/**
 * Manual business expense — fuel, packaging, vehicle maintenance, etc.
 * Originates outside the online order flow, so unlike revenue it can't be
 * derived from `orders`; it needs its own persistent record.
 *
 * Money is kuruş (minor units), CLAUDE.md §7. `category` is free text on
 * purpose — the suggested list below is a UI affordance, not a DB enum, so
 * a new category is a constant edit, not a migration.
 */

export type ExpensePaymentStatus = "paid" | "pending";
export type ManualPaymentMethod = "cash" | "card" | "bank_transfer" | "other";

export interface Expense {
  readonly id: string;
  readonly category: string;
  readonly amount_minor: number;
  readonly expense_date: string; // YYYY-MM-DD
  readonly description: string | null;
  readonly payment_status: ExpensePaymentStatus;
  readonly payment_method: ManualPaymentMethod | null;
  readonly vendor: string | null;
  readonly note: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly created_by: string | null;
}

/** Suggested categories for the expense form's `<Select>`. Free text is
 *  still accepted underneath — this list exists so an admin doesn't have to
 *  invent a category name every time, not to constrain what's allowed. */
export const EXPENSE_CATEGORY_OPTIONS: readonly string[] = [
  "Yakıt",
  "Ambalaj",
  "Kargo",
  "Pazar Giderleri",
  "Araç Giderleri",
  "Üretim Giderleri",
  "Malzeme",
  "Bakım ve Onarım",
  "Personel / Hizmet",
  "Diğer",
];

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
