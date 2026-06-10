/**
 * Partition a list of customer ids into those that are safe to delete (no
 * orders) and those that are blocked (have ≥ 1 order).
 *
 * `counts` is the Map returned by `countOrdersByCustomer`. Ids absent from
 * the Map are treated as having 0 orders (i.e. deletable).
 */
export function partitionDeletable(
  ids: ReadonlyArray<string>,
  counts: ReadonlyMap<string, number>,
): { blocked: { id: string; orderCount: number }[]; deletable: string[] } {
  const blocked: { id: string; orderCount: number }[] = [];
  const deletable: string[] = [];
  for (const id of ids) {
    const n = counts.get(id) ?? 0;
    if (n > 0) blocked.push({ id, orderCount: n });
    else deletable.push(id);
  }
  return { blocked, deletable };
}
