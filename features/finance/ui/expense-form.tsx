"use client";

/**
 * Create/edit expense form, rendered inside a Dialog — copies
 * features/products/ui/product-form.tsx's pattern: useState + useTransition
 * + direct Server Action call, sonner toasts on the Result.
 */
import { Loader2 } from "lucide-react";
import { type ReactElement, type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  EXPENSE_CATEGORY_OPTIONS,
  MANUAL_PAYMENT_METHOD_LABELS,
  type Expense,
  type ExpensePaymentStatus,
  type ManualPaymentMethod,
} from "@/features/finance/domain/expense";
import { createExpenseAction, updateExpenseAction } from "@/features/finance/application/expense-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parseTRYInput } from "@/shared/utils/money";
import { todayInIstanbul } from "@/shared/utils/date";

interface FieldsState {
  category: string;
  amount: string; // TRY
  expense_date: string;
  description: string;
  payment_status: ExpensePaymentStatus;
  payment_method: ManualPaymentMethod | "";
  vendor: string;
  note: string;
}

function initialFields(expense?: Expense): FieldsState {
  return {
    category: expense?.category ?? "",
    amount: expense ? (expense.amount_minor / 100).toFixed(2).replace(".", ",") : "",
    expense_date: expense?.expense_date ?? todayInIstanbul(),
    description: expense?.description ?? "",
    payment_status: expense?.payment_status ?? "pending",
    payment_method: expense?.payment_method ?? "",
    vendor: expense?.vendor ?? "",
    note: expense?.note ?? "",
  };
}

const PAYMENT_METHOD_OPTIONS = Object.entries(MANUAL_PAYMENT_METHOD_LABELS) as Array<
  [ManualPaymentMethod, string]
>;

export function ExpenseFormDialog({
  mode,
  expense,
  trigger,
}: {
  mode: "create" | "edit";
  expense?: Expense;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<FieldsState>(() => initialFields(expense));
  const [saving, startSaving] = useTransition();

  const set = (patch: Partial<FieldsState>) => setFields((prev) => ({ ...prev, ...patch }));

  const onOpenChange = (next: boolean) => {
    if (next) setFields(initialFields(expense));
    setOpen(next);
  };

  const submit = () => {
    const amount_minor = parseTRYInput(fields.amount);
    if (amount_minor === null || amount_minor <= 0) {
      toast.error("Geçersiz tutar.");
      return;
    }
    if (fields.category.trim() === "") {
      toast.error("Kategori gerekli.");
      return;
    }

    const payload = {
      category: fields.category,
      amount_minor,
      expense_date: fields.expense_date,
      description: fields.description,
      payment_status: fields.payment_status,
      payment_method: fields.payment_method === "" ? null : fields.payment_method,
      vendor: fields.vendor,
      note: fields.note,
    };

    startSaving(async () => {
      const result =
        mode === "create"
          ? await createExpenseAction(payload)
          : await updateExpenseAction({ ...payload, id: expense!.id });

      if (result.ok) {
        toast.success(mode === "create" ? "Gider eklendi." : "Gider güncellendi.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger as ReactElement} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Gider Ekle" : "Gideri düzenle"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ef-category">Gider Kategorisi</Label>
              <Input
                id="ef-category"
                list="ef-category-options"
                value={fields.category}
                onChange={(e) => set({ category: e.target.value })}
                placeholder="ör. Yakıt"
                autoFocus
              />
              <datalist id="ef-category-options">
                {EXPENSE_CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ef-amount">Tutar (₺)</Label>
              <Input
                id="ef-amount"
                inputMode="decimal"
                value={fields.amount}
                onChange={(e) => set({ amount: e.target.value })}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ef-date">Tarih</Label>
              <Input
                id="ef-date"
                type="date"
                value={fields.expense_date}
                onChange={(e) => set({ expense_date: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ef-vendor">Firma / Kişi — opsiyonel</Label>
              <Input
                id="ef-vendor"
                value={fields.vendor}
                onChange={(e) => set({ vendor: e.target.value })}
                placeholder="ör. Petrol Ofisi"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ef-desc">Açıklama — opsiyonel</Label>
            <Textarea
              id="ef-desc"
              value={fields.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ef-status">Ödeme Durumu</Label>
              <Select
                value={fields.payment_status}
                onValueChange={(v) => set({ payment_status: v as ExpensePaymentStatus })}
              >
                <SelectTrigger id="ef-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Ödeme Bekliyor</SelectItem>
                  <SelectItem value="paid">Ödendi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ef-method">Ödeme Yöntemi</Label>
              <Select
                value={fields.payment_method}
                onValueChange={(v) => set({ payment_method: v as ManualPaymentMethod })}
              >
                <SelectTrigger id="ef-method" className="w-full">
                  <SelectValue placeholder="Seçin" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ef-note">Not — opsiyonel</Label>
            <Textarea
              id="ef-note"
              value={fields.note}
              onChange={(e) => set({ note: e.target.value })}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={saving} />}>İptal</DialogClose>
          <Button type="button" onClick={submit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isCreate ? "Ekle" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
