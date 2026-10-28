/**
 * The "dummy" label stuck on a parcel we hand to Aras Kargo (Aras's "Sipariş
 * Bazlı" template, SetOrder doc Şekil 1). At the branch, staff pick our
 * sender record on the "Entegrasyon ile Sevk İşlemleri" screen and scan the
 * barcode; Aras then prints its own final barcode for the parcel.
 */
import { toIstanbulDateString } from "@/shared/utils/date";

/** Who the parcel is from, as printed on the label. */
export const ARAS_LABEL_SENDER = "Apuhan Çiftliği";

/**
 * The sender record staff must select at the branch. Aras defines its exact
 * name on their side; update this once they confirm it.
 */
export const ARAS_LABEL_ACCOUNT_SELECTION = "Apuhan Çiftliği Sipariş Bazlı";

export interface ArasLabel {
  /** dd.MM.yyyy in Europe/Istanbul. */
  readonly date: string;
  readonly sender: string;
  readonly receiver: string;
  readonly integrationCode: string;
  readonly accountSelection: string;
}

export function composeArasLabel(input: {
  integrationCode: string;
  firstName: unknown;
  lastName: unknown;
  printedAt: Date;
}): ArasLabel {
  const part = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const receiver = [part(input.firstName), part(input.lastName)].filter(Boolean).join(" ") || "—";
  const [y, m, d] = toIstanbulDateString(input.printedAt).split("-");

  return {
    date: `${d}.${m}.${y}`,
    sender: ARAS_LABEL_SENDER,
    receiver,
    integrationCode: input.integrationCode,
    accountSelection: ARAS_LABEL_ACCOUNT_SELECTION,
  };
}
