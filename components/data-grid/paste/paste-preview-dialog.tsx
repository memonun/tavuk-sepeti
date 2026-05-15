"use client";

/**
 * Paste preview — opens when the user pastes a multi-row clipboard payload
 * into the empty-row sentinel. Displays the parsed rows + per-row
 * validation status, then commits them via the feature's onBulkCreate
 * Server Action.
 *
 * The preview is intentionally rendered as a plain HTML table inside the
 * dialog (not a nested DataGrid) — keeps the import surface narrow and
 * dodges a circular dependency with the orchestrator.
 */
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PastePreviewRow {
  readonly cells: ReadonlyArray<string>;
  /** Validation messages keyed by column index. Empty = row is valid. */
  readonly issues: ReadonlyArray<string>;
}

export interface PastePreviewDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly headers: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<PastePreviewRow>;
  readonly entityLabel: string;
  readonly onConfirm: () => Promise<void> | void;
  readonly busy?: boolean;
}

export function PastePreviewDialog({
  open,
  onOpenChange,
  headers,
  rows,
  entityLabel,
  onConfirm,
  busy = false,
}: PastePreviewDialogProps) {
  const [confirming, setConfirming] = useState(false);
  const validRows = rows.filter((r) => r.issues.length === 0).length;
  const invalidRows = rows.length - validRows;
  const blocked = invalidRows > 0 || rows.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Toplu yapıştırma önizleme</DialogTitle>
          <DialogDescription>
            {validRows} {entityLabel} oluşturulacak.{" "}
            {invalidRows > 0
              ? `${invalidRows} satırda hata var — düzeltmeden devam edilemez.`
              : "Onaylar mısın?"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="w-8 px-2 py-1.5 text-left font-medium">#</th>
                {headers.map((h, i) => (
                  <th key={i} className="px-2 py-1.5 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className={cn(
                    "border-t",
                    row.issues.length > 0 && "bg-destructive/5",
                  )}
                >
                  <td className="px-2 py-1 text-muted-foreground">{rIdx + 1}</td>
                  {row.cells.map((cell, cIdx) => (
                    <td key={cIdx} className="px-2 py-1">
                      {cell || <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy || confirming}
          >
            İptal
          </Button>
          <Button
            type="button"
            disabled={blocked || busy || confirming}
            onClick={async () => {
              setConfirming(true);
              try {
                await onConfirm();
              } finally {
                setConfirming(false);
              }
            }}
          >
            {confirming ? "Oluşturuluyor…" : `${validRows} kayıt oluştur`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
