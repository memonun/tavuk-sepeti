"use client";

/**
 * Optimistic row layer over server-rendered data.
 *
 * The server is the source of truth — pages are fetched fresh whenever
 * URL state changes. This hook overlays in-flight cell edits on top of
 * that snapshot so the UI reflects the user's most recent action without
 * waiting for the server roundtrip.
 *
 * Strategy:
 * - Each commit gets a monotonic revision id.
 * - On SUCCESS the patch is RETAINED (it already shows the right value) until a
 *   fresh server snapshot (`base`) lands and supersedes it — see the base-sync
 *   effect below. This lets the cell-commit Server Action skip revalidatePath
 *   entirely (no full-table refetch per keystroke); a single debounced refresh
 *   reconciles later. Without retention, dropping the patch before `base`
 *   refreshed would flash the cell back to its old value.
 * - On FAILURE the patch is dropped (rollback) and the error surfaced so the
 *   caller can toast + red-border the cell.
 * - In-flight patches survive a `base` refresh (their write may not be in that
 *   snapshot yet); only settled patches are cleared by it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

export interface OptimisticPatch<TRow> {
  readonly partial: Partial<TRow>;
  readonly revision: number;
}

export interface UseOptimisticRowsResult<TRow, TPatch> {
  readonly rows: ReadonlyArray<TRow>;
  /**
   * Issue a cell commit. The caller supplies the optimistic row partial
   * (already field-mapped + value-transformed) so this hook stays agnostic
   * of how a column id maps to a row field. Returns the eventual server
   * result.
   */
  readonly commit: (
    rowId: string,
    partial: Partial<TRow>,
    patch: TPatch,
  ) => Promise<Result<TRow, AppError>>;
  /** True while at least one cell commit is in flight. */
  readonly pendingCount: number;
}

export interface UseOptimisticRowsOptions<TRow, TPatch> {
  readonly base: ReadonlyArray<TRow>;
  readonly rowId: (row: TRow) => string;
  readonly mutate: (rowId: string, patch: TPatch) => Promise<Result<TRow, AppError>>;
}

export function useOptimisticRows<TRow extends object, TPatch>({
  base,
  rowId,
  mutate,
}: UseOptimisticRowsOptions<TRow, TPatch>): UseOptimisticRowsResult<TRow, TPatch> {
  const [patches, setPatches] = useState<Record<string, OptimisticPatch<TRow>>>(
    {},
  );
  const [pendingCount, setPendingCount] = useState(0);
  const revisionCounter = useRef(0);
  // Per-row count of in-flight commits. A row with >0 keeps its patch across a
  // base refresh (the write may not be reflected in that snapshot yet).
  const inFlight = useRef<Map<string, number>>(new Map());
  const prevBase = useRef(base);

  // When a fresh server snapshot lands (router.refresh / navigation), drop a
  // SETTLED optimistic patch only once that snapshot actually REFLECTS the write
  // (every patched field already matches the base row). A snapshot that predates
  // the write — e.g. a peer-edit refresh or the realtime coalesce window landing
  // just after the action resolved — would otherwise flash the cell back to its
  // old value; instead we retain the patch until a snapshot catches up.
  // In-flight patches are always preserved.
  useEffect(() => {
    if (prevBase.current === base) return;
    prevBase.current = base;
    setPatches((cur) => {
      if (Object.keys(cur).length === 0) return cur;
      const baseById = new Map(base.map((row) => [rowId(row), row]));
      const keep: Record<string, OptimisticPatch<TRow>> = {};
      let dropped = false;
      for (const [id, patch] of Object.entries(cur)) {
        if ((inFlight.current.get(id) ?? 0) > 0) {
          keep[id] = patch;
          continue;
        }
        const baseRow = baseById.get(id) as Record<string, unknown> | undefined;
        const reflected =
          baseRow != null &&
          Object.entries(patch.partial).every(([k, v]) =>
            Object.is(baseRow[k], v),
          );
        if (reflected) dropped = true; // canonical now matches → safe to drop
        else keep[id] = patch; // snapshot is stale → keep the optimistic value
      }
      return dropped ? keep : cur;
    });
  }, [base, rowId]);

  const rows = useMemo<ReadonlyArray<TRow>>(() => {
    if (Object.keys(patches).length === 0) return base;
    return base.map((row) => {
      const id = rowId(row);
      const patch = patches[id];
      return patch ? { ...row, ...patch.partial } : row;
    });
  }, [base, patches, rowId]);

  const commit = useCallback(
    async (
      id: string,
      partial: Partial<TRow>,
      patch: TPatch,
    ): Promise<Result<TRow, AppError>> => {
      const revision = ++revisionCounter.current;
      inFlight.current.set(id, (inFlight.current.get(id) ?? 0) + 1);
      setPatches((cur) => ({ ...cur, [id]: { partial, revision } }));
      setPendingCount((c) => c + 1);

      const result = await mutate(id, patch);

      setPendingCount((c) => Math.max(0, c - 1));
      const remaining = (inFlight.current.get(id) ?? 1) - 1;
      if (remaining <= 0) inFlight.current.delete(id);
      else inFlight.current.set(id, remaining);

      if (!result.ok) {
        // Rollback — unless a newer commit for this row has overtaken us.
        setPatches((cur) => {
          const existing = cur[id];
          if (existing && existing.revision !== revision) return cur;
          const next = { ...cur };
          delete next[id];
          return next;
        });
      }
      // On success the patch is RETAINED; the base-sync effect clears it once a
      // fresh snapshot reflects the write.

      return result;
    },
    [mutate],
  );

  return { rows, commit, pendingCount };
}
