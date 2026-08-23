"use client";

/** Düzenle / Durdur / Devam Ettir / Sil — same direct-trigger pattern as
 *  features/finance/ui/expense-row-actions.tsx. Sil only succeeds server-side
 *  when the template has never generated an expense (FK restrict); a
 *  template with history should use Durdur instead (spec §16). */
import { Loader2, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteRecurringExpenseTemplateAction,
  setRecurringExpenseTemplateActiveAction,
} from "@/features/finance/application/recurring-expense-template-actions";
import { RecurringExpenseTemplateFormDialog } from "@/features/finance/ui/recurring-expense-template-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ExpenseCategoryNode } from "@/features/finance/domain/expense-category";
import type { RecurringExpenseTemplate } from "@/features/finance/domain/recurring-expense-template";

export function RecurringExpenseTemplateRowActions({
  template,
  categories,
}: {
  template: RecurringExpenseTemplate;
  categories: readonly ExpenseCategoryNode[];
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startPending] = useTransition();

  const toggleActive = () => {
    startPending(async () => {
      const result = await setRecurringExpenseTemplateActiveAction({
        id: template.id,
        active: !template.active,
      });
      if (result.ok) {
        toast.success(template.active ? "Rutin gider durduruldu." : "Rutin gidere devam ediliyor.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const confirmDelete = () => {
    startPending(async () => {
      const result = await deleteRecurringExpenseTemplateAction({ id: template.id });
      if (result.ok) {
        toast.success("Rutin gider silindi.");
        setDeleteOpen(false);
        router.refresh();
      } else {
        // CONFLICT — template has generated expenses. Message already
        // points at Durdur; no need to duplicate it in a second toast.
        toast.error(result.error.message);
        setDeleteOpen(false);
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label={template.active ? "Durdur" : "Devam Ettir"}
        onClick={toggleActive}
        disabled={pending}
      >
        {template.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>

      <RecurringExpenseTemplateFormDialog
        mode="edit"
        template={template}
        categories={categories}
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Düzenle">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        }
      />

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive"
        aria-label="Sil"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rutin gideri sil</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            &quot;{template.name}&quot; rutin giderini silmek istediğine emin misin? Geçmiş
            kayıtları varsa silme işlemi engellenir — bunun yerine durdurabilirsin.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Vazgeç
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={pending} className="gap-1.5">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
