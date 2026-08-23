"use client";

/** İşlemler cell: edit (Dialog form), mark-paid shortcut, delete (confirm
 *  Dialog) — plain inline icon buttons, same direct-trigger pattern as
 *  features/customers/ui/customer-detail-panel.tsx's delete confirm (no
 *  AlertDialog primitive exists, and nesting a Dialog trigger inside a
 *  dropdown menu item is a known-fragile combination best avoided). */
import { CircleCheck, Loader2, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteExpenseAction, markExpensePaidAction } from "@/features/finance/application/expense-actions";
import { ExpenseFormDialog } from "@/features/finance/ui/expense-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { Expense } from "@/features/finance/domain/expense";
import type { ExpenseCategoryNode } from "@/features/finance/domain/expense-category";

export function ExpenseRowActions({
  expense,
  categories,
  categoryLabel,
}: {
  expense: Expense;
  categories: readonly ExpenseCategoryNode[];
  categoryLabel: string;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startPending] = useTransition();

  const markPaid = () => {
    startPending(async () => {
      const result = await markExpensePaidAction({ id: expense.id });
      if (result.ok) {
        toast.success("Gider ödendi olarak işaretlendi.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const confirmDelete = () => {
    startPending(async () => {
      const result = await deleteExpenseAction({ id: expense.id });
      if (result.ok) {
        toast.success("Gider silindi.");
        setDeleteOpen(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {expense.payment_status === "pending" ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Ödendi olarak işaretle"
          onClick={markPaid}
          disabled={pending}
        >
          <CircleCheck className="h-4 w-4" />
        </Button>
      ) : null}

      <ExpenseFormDialog
        mode="edit"
        expense={expense}
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
            <DialogTitle>Gideri sil</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            &quot;{categoryLabel}&quot; giderini silmek istediğine emin misin? Bu işlem geri
            alınamaz.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
