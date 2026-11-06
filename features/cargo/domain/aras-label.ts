/**
 * The "dummy" label stuck on a parcel we hand to Aras Kargo (SetOrder doc
 * Şekil 1). At the branch, staff scan its barcode (our integration code);
 * Aras then prints its own final barcode for the parcel. Aras approved this
 * label in testing and asked only that the template's bottom "Sipariş Bazlı"
 * note be left off, so there is no such line here.
 */
import { toIstanbulDateString } from "@/shared/utils/date";

/** Who the parcel is from, as printed on the label. */
export const ARAS_LABEL_SENDER = "Apuhan Çiftliği";

export interface ArasLabel {
  /** dd.MM.yyyy in Europe/Istanbul. */
  readonly date: string;
  readonly sender: string;
  readonly receiver: string;
  readonly integrationCode: string;
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
  };
}
