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
 * - When the server returns a fresh row, we replace the optimistic patch
 *   with the canonical value, but only if no newer commit has landed
 *   for that row in the meantime (revision-counter guard).
 * - When the commit fails, we drop the patch and surface the error so
 *   the caller can show a toast and red-border the cell.
 */
import { useCallback, useMemo, useRef, useState } from "react";

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
      setPatches((cur) => ({ ...cur, [id]: { partial, revision } }));
      setPendingCount((c) => c + 1);

      const result = await mutate(id, patch);

      setPendingCount((c) => Math.max(0, c - 1));
      setPatches((cur) => {
        const existing = cur[id];
        // A newer commit has overtaken us — leave that one in place.
        if (existing && existing.revision !== revision) return cur;
        const next = { ...cur };
        delete next[id];
        return next;
      });

      return result;
    },
    [mutate],
  );

  return { rows, commit, pendingCount };
}
