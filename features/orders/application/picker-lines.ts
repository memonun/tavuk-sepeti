/**
 * How an order's draft lines react to the "Özel fiyat" box, the "Müşteri için
 * kaydet" mark and the saved-price controls. Pure so the rules are testable;
 * ProductPicker only calls these.
 *
 *   - A price typed on a line is for THIS order. It becomes the customer's
 *     saved price only when the line is marked (`save_for_customer`).
 *   - Typing an amount other than the saved price clears the mark, so a saved
 *     price changes only when the owner ticks the box again.
 *   - "Kayıtlı fiyatı kaldır" returns the order's line to normal pricing and
 *     queues the removal; "Geri al" puts the saved price back.
 */
export interface DraftLine {
  product_key: string;
  quantity: number;
  unit_price_minor?: number;
  save_for_customer?: boolean;
}

/** A new line starts at the customer's saved price, unless it is being removed. */
export function newDraftLine(
  productKey: string,
  quantity: number,
  savedMinor: number | undefined,
  savedRemoved: boolean,
): DraftLine {
  return savedMinor != null && !savedRemoved
    ? {
        product_key: productKey,
        quantity,
        unit_price_minor: savedMinor,
        save_for_customer: true,
      }
    : { product_key: productKey, quantity };
}

/** The special price is per product, so it applies to every row of that product. */
export function setProductSpecial(
  lines: readonly DraftLine[],
  productKey: string,
  minor: number | undefined,
  savedMinor: number | undefined,
  savedRemoved: boolean,
): DraftLine[] {
  return lines.map((line) => {
    if (line.product_key !== productKey) return line;
    const next = { ...line };
    if (minor == null) {
      delete next.unit_price_minor;
      delete next.save_for_customer;
      return next;
    }
    next.unit_price_minor = minor;
    next.save_for_customer = savedMinor != null && minor === savedMinor && !savedRemoved;
    return next;
  });
}

export function setProductSave(
  lines: readonly DraftLine[],
  productKey: string,
  save: boolean,
): DraftLine[] {
  return lines.map((line) =>
    line.product_key === productKey ? { ...line, save_for_customer: save } : line,
  );
}

/** Drop the order's price back to normal when it was the saved one. */
export function removeSavedFromLines(
  lines: readonly DraftLine[],
  productKey: string,
  savedMinor: number | undefined,
): DraftLine[] {
  return lines.map((line) => {
    if (line.product_key !== productKey) return line;
    const next = { ...line };
    if (savedMinor != null && line.unit_price_minor === savedMinor) delete next.unit_price_minor;
    delete next.save_for_customer;
    return next;
  });
}

/** Bring the saved price back onto lines that have no price of their own. */
export function undoRemoveSavedOnLines(
  lines: readonly DraftLine[],
  productKey: string,
  savedMinor: number | undefined,
): DraftLine[] {
  if (savedMinor == null) return [...lines];
  return lines.map((line) =>
    line.product_key === productKey && line.unit_price_minor == null
      ? { ...line, unit_price_minor: savedMinor, save_for_customer: true }
      : line,
  );
}
