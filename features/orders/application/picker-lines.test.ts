import { describe, expect, it } from "vitest";

import {
  newDraftLine,
  removeSavedFromLines,
  setProductSave,
  setProductSpecial,
  undoRemoveSavedOnLines,
  type DraftLine,
} from "@/features/orders/application/picker-lines";

const eggs = (extra: Partial<DraftLine> = {}): DraftLine => ({ product_key: "eggs", quantity: 3, ...extra });

describe("newDraftLine", () => {
  it("starts at the customer's saved price and marks it as saved", () => {
    expect(newDraftLine("eggs", 1, 10000, false)).toEqual({
      product_key: "eggs",
      quantity: 1,
      unit_price_minor: 10000,
      save_for_customer: true,
    });
  });
  it("starts at the catalog price when there is no saved price", () => {
    expect(newDraftLine("eggs", 1, undefined, false)).toEqual({ product_key: "eggs", quantity: 1 });
  });
  it("ignores a saved price that is being removed", () => {
    expect(newDraftLine("eggs", 1, 10000, true)).toEqual({ product_key: "eggs", quantity: 1 });
  });
});

describe("setProductSpecial", () => {
  it("a new price is this order only — the save mark stays off", () => {
    const [line] = setProductSpecial([eggs()], "eggs", 9000, undefined, false);
    expect(line).toEqual(eggs({ unit_price_minor: 9000, save_for_customer: false }));
  });

  it("changing a saved line's amount clears the mark so the saved price is not overwritten", () => {
    const [line] = setProductSpecial(
      [eggs({ unit_price_minor: 10000, save_for_customer: true })],
      "eggs",
      9000,
      10000,
      false,
    );
    expect(line?.unit_price_minor).toBe(9000);
    expect(line?.save_for_customer).toBe(false);
  });

  it("typing the saved amount again keeps it marked as the saved price", () => {
    const [line] = setProductSpecial([eggs()], "eggs", 10000, 10000, false);
    expect(line?.save_for_customer).toBe(true);
  });

  it("emptying the box returns to catalog pricing and drops the mark", () => {
    const [line] = setProductSpecial(
      [eggs({ unit_price_minor: 10000, save_for_customer: true })],
      "eggs",
      undefined,
      10000,
      false,
    );
    expect(line).toEqual(eggs());
  });

  it("applies to every row of the product and leaves other products alone", () => {
    const milk: DraftLine = { product_key: "milk", quantity: 5, unit_price_minor: 4000 };
    const rows = setProductSpecial([eggs(), eggs({ quantity: 1 }), milk], "eggs", 9000, undefined, false);
    expect(rows.map((r) => r.unit_price_minor)).toEqual([9000, 9000, 4000]);
  });
});

describe("setProductSave", () => {
  it("toggles the mark on the product's rows only", () => {
    const rows = setProductSave(
      [eggs({ unit_price_minor: 9000 }), { product_key: "milk", quantity: 5 }],
      "eggs",
      true,
    );
    expect(rows[0]?.save_for_customer).toBe(true);
    expect(rows[1]).not.toHaveProperty("save_for_customer");
  });
});

describe("remove / undo the saved price", () => {
  const saved = eggs({ unit_price_minor: 10000, save_for_customer: true });

  it("removing sends the line back to normal pricing", () => {
    expect(removeSavedFromLines([saved], "eggs", 10000)).toEqual([eggs()]);
  });

  it("removing keeps a different, order-only price on the line", () => {
    const oneOff = eggs({ unit_price_minor: 9000, save_for_customer: false });
    const [line] = removeSavedFromLines([oneOff], "eggs", 10000);
    expect(line?.unit_price_minor).toBe(9000);
    expect(line).not.toHaveProperty("save_for_customer");
  });

  it("undo brings the saved price back onto lines without a price", () => {
    const removed = removeSavedFromLines([saved], "eggs", 10000);
    expect(undoRemoveSavedOnLines(removed, "eggs", 10000)).toEqual([saved]);
  });

  it("undo does not overwrite a price the owner typed meanwhile", () => {
    const typed = eggs({ unit_price_minor: 9000, save_for_customer: false });
    expect(undoRemoveSavedOnLines([typed], "eggs", 10000)).toEqual([typed]);
  });
});
