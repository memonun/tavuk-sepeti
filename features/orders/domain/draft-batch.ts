import type { PaymentMethod, TimeSlot } from "@/features/orders/domain/order";

export interface BasketLine {
  product_key: string;
  quantity: number;
}

export interface DraftBatch {
  scheduledFor: string; // YYYY-MM-DD
  defaults: {
    timeSlot: TimeSlot | null;
    paymentMethod: PaymentMethod;
    deliveryFeeMinor: number;
  };
  assignments: Record<string, BasketLine[]>;
}

export interface CoverageLine {
  product_key: string;
  presentCount: number;
  total: number;
  state: "all" | "partial";
  commonQty: number | null;
  mixedQty: boolean;
}

export function emptyBatch(scheduledFor: string): DraftBatch {
  return {
    scheduledFor,
    defaults: { timeSlot: null, paymentMethod: "cash_on_delivery", deliveryFeeMinor: 0 },
    assignments: {},
  };
}

export function computeCoverage(
  selectedIds: readonly string[],
  batch: DraftBatch,
): CoverageLine[] {
  const n = selectedIds.length;
  if (n === 0) return [];

  const qtysByProduct = new Map<string, number[]>();
  for (const id of selectedIds) {
    const lines = batch.assignments[id] ?? [];
    for (const line of lines) {
      const arr = qtysByProduct.get(line.product_key) ?? [];
      arr.push(line.quantity);
      qtysByProduct.set(line.product_key, arr);
    }
  }

  const out: CoverageLine[] = [];
  for (const [product_key, qtys] of qtysByProduct) {
    const presentCount = qtys.length;
    const first = qtys[0]!;
    const allSame = qtys.every((q) => q === first);
    out.push({
      product_key,
      presentCount,
      total: n,
      state: presentCount === n ? "all" : "partial",
      commonQty: allSame ? first : null,
      mixedQty: !allSame,
    });
  }

  out.sort((a, b) =>
    a.product_key < b.product_key ? -1 : a.product_key > b.product_key ? 1 : 0,
  );
  return out;
}

export function applyLine(
  batch: DraftBatch,
  ids: readonly string[],
  line: BasketLine,
): DraftBatch {
  const assignments = { ...batch.assignments };
  for (const id of ids) {
    const current = assignments[id] ?? [];
    const without = current.filter((l) => l.product_key !== line.product_key);
    assignments[id] = [...without, { product_key: line.product_key, quantity: line.quantity }];
  }
  return { ...batch, assignments };
}

export function removeLine(
  batch: DraftBatch,
  ids: readonly string[],
  productKey: string,
): DraftBatch {
  const assignments = { ...batch.assignments };
  for (const id of ids) {
    const current = assignments[id];
    if (!current) continue;
    assignments[id] = current.filter((l) => l.product_key !== productKey);
  }
  return { ...batch, assignments };
}

export function clearCustomers(batch: DraftBatch, ids: readonly string[]): DraftBatch {
  const assignments = { ...batch.assignments };
  for (const id of ids) delete assignments[id];
  return { ...batch, assignments };
}
