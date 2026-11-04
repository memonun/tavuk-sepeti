/**
 * Aras Kargo parcel label for one order, ready to print. On screen it sits in
 * the admin shell with a print button; when printed, only the 100×100 mm
 * label goes to paper (the print rules below hide everything else).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { getArasLabel } from "@/features/cargo/application/aras";
import { ArasLabelSheet } from "@/features/cargo/ui/aras-label-sheet";
import { PrintLabelButton } from "@/features/cargo/ui/print-label-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRINT_CSS = `
@page { size: 100mm 100mm; margin: 0; }
@media print {
  body * { visibility: hidden !important; }
  .aras-label-sheet, .aras-label-sheet * { visibility: visible !important; }
  .aras-label-sheet { position: fixed; left: 0; top: 0; }
}
`;

export default async function ArasLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.string().uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const result = await getArasLabel(parsed.data);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Aras Etiketi</h2>
          <p className="text-sm text-muted-foreground">
            Paketin üzerine yapıştırın. Şubede barkod okutulur.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/kargo" className={cn(buttonVariants({ variant: "ghost" }))}>
            Kargo&apos;ya dön
          </Link>
          {result.ok ? <PrintLabelButton /> : null}
        </div>
      </div>

      {result.ok ? (
        <>
          <style>{PRINT_CSS}</style>
          <ArasLabelSheet label={result.value} />
        </>
      ) : (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
          {result.error.message}
        </div>
      )}
    </div>
  );
}
