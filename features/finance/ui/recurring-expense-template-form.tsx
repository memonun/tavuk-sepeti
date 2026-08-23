"use client";

/**
 * Create/edit form for a recurring expense template, rendered inside a
 * Dialog — same useState + useTransition + direct Server Action pattern as
 * features/finance/ui/expense-form.tsx.
 */
import { Loader2 } from "lucide-react";
import { type ReactElement, type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { MANUAL_PAYMENT_METHOD_LABELS, type ManualPaymentMethod } from "@/features/finance/domain/expense";
import {
  RECURRING_EXPENSE_AMOUNT_TYPE_LABELS,
  RECURRING_EXPENSE_CADENCE_LABELS,
  type RecurringExpenseAmountType,
  type RecurringExpenseCadence,
  type RecurringExpenseTemplate,
} from "@/features/finance/domain/recurring-expense-template";
import {
  createRecurringExpenseTemplateAction,
  updateRecurringExpenseTemplateAction,
} from "@/features/finance/application/recurring-expense-template-actions";
import { ExpenseCategorySelect } from "@/features/finance/ui/expense-category-select";
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

import type { ExpenseCategoryNode } from "@/features/finance/domain/expense-category";

const DOW_LABELS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"] as const;
const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);
const CADENCE_OPTIONS = Object.entries(RECURRING_EXPENSE_CADENCE_LABELS) as Array<
  [RecurringExpenseCadence, string]
>;
const AMOUNT_TYPE_OPTIONS = Object.entries(RECURRING_EXPENSE_AMOUNT_TYPE_LABELS) as Array<
  [RecurringExpenseAmountType, string]
>;
const PAYMENT_METHOD_OPTIONS = Object.entries(MANUAL_PAYMENT_METHOD_LABELS) as Array<
  [ManualPaymentMethod, string]
>;

interface FieldsState {
  name: string;
  category_id: string;
  vendor: string;
  description: string;
  amount_type: RecurringExpenseAmountType;
  amount: string; // TRY
  cadence: RecurringExpenseCadence;
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  end_date: string;
  payment_method: ManualPaymentMethod | "";
  note: string;
}

function initialFields(template?: RecurringExpenseTemplate): FieldsState {
  return {
    name: template?.name ?? "",
    category_id: template?.category_id ?? "",
    vendor: template?.vendor ?? "",
    description: template?.description ?? "",
    amount_type: template?.amount_type ?? "variable",
    amount: template ? (template.default_amount_minor / 100).toFixed(2).replace(".", ",") : "",
    cadence: template?.cadence ?? "monthly",
    day_of_week: template?.day_of_week ?? null,
    day_of_month: template?.day_of_month ?? todayInIstanbulDay(),
    start_date: template?.start_date ?? todayInIstanbul(),
    end_date: template?.end_date ?? "",
    payment_method: template?.payment_method ?? "",
    note: template?.note ?? "",
  };
}

function todayInIstanbulDay(): number {
  return Number(todayInIstanbul().slice(8, 10));
}

export function RecurringExpenseTemplateFormDialog({
  mode,
  template,
  categories,
  trigger,
}: {
  mode: "create" | "edit";
  template?: RecurringExpenseTemplate;
  categories: readonly ExpenseCategoryNode[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<FieldsState>(() => initialFields(template));
  const [saving, startSaving] = useTransition();

  const set = (patch: Partial<FieldsState>) => setFields((prev) => ({ ...prev, ...patch }));

  const onOpenChange = (next: boolean) => {
    if (next) setFields(initialFields(template));
    setOpen(next);
  };

  const setCadence = (cadence: RecurringExpenseCadence) => {
    if (cadence === "weekly") {
      set({ cadence, day_of_week: fields.day_of_week ?? 1, day_of_month: null });
    } else {
      set({ cadence, day_of_month: fields.day_of_month ?? todayInIstanbulDay(), day_of_week: null });
    }
  };

  const submit = () => {
    const amount_minor = parseTRYInput(fields.amount);
    if (amount_minor === null || amount_minor <= 0) {
      toast.error("Geçersiz tutar.");
      return;
    }
    if (fields.name.trim() === "") {
      toast.error("Gider adı gerekli.");
      return;
    }
    if (fields.category_id === "") {
      toast.error("Kategori gerekli.");
      return;
    }

    const payload = {
      name: fields.name,
      category_id: fields.category_id,
      vendor: fields.vendor,
      description: fields.description,
      amount_type: fields.amount_type,
      default_amount_minor: amount_minor,
      cadence: fields.cadence,
      day_of_week: fields.day_of_week,
      day_of_month: fields.day_of_month,
      start_date: fields.start_date,
      end_date: fields.end_date === "" ? null : fields.end_date,
      payment_method: fields.payment_method === "" ? null : fields.payment_method,
      note: fields.note,
    };

    startSaving(async () => {
      const result =
        mode === "create"
          ? await createRecurringExpenseTemplateAction(payload)
          : await updateRecurringExpenseTemplateAction({ ...payload, id: template!.id });

      if (result.ok) {
        toast.success(mode === "create" ? "Rutin gider eklendi." : "Rutin gider güncellendi.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const isCreate = mode === "create";
  const amountLabel = fields.amount_type === "fixed" ? "Tutar (₺)" : "Tahmini Tutar (₺)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger as ReactElement} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Rutin Gider Ekle" : "Rutin gideri düzenle"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rt-name">Gider Adı</Label>
            <Input
              id="rt-name"
              value={fields.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="ör. Türk Telekom İnternet"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rt-category">Kategori</Label>
            <ExpenseCategorySelect
              id="rt-category"
              categories={categories}
              value={fields.category_id}
              onValueChange={(category_id) => set({ category_id })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rt-vendor">Firma / Kişi — opsiyonel</Label>
              <Input
                id="rt-vendor"
                value={fields.vendor}
                onChange={(e) => set({ vendor: e.target.value })}
                placeholder="ör. Türk Telekom"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rt-payment-method">Ödeme Yöntemi — opsiyonel</Label>
              <Select
                value={fields.payment_method}
                onValueChange={(v) => {
                  if (typeof v === "string") set({ payment_method: v as ManualPaymentMethod });
                }}
                items={MANUAL_PAYMENT_METHOD_LABELS}
              >
                <SelectTrigger id="rt-payment-method" className="w-full">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rt-cadence">Tekrar Sıklığı</Label>
              <Select
                value={fields.cadence}
                onValueChange={(v) => {
                  if (typeof v === "string") setCadence(v as RecurringExpenseCadence);
                }}
                items={RECURRING_EXPENSE_CADENCE_LABELS}
              >
                <SelectTrigger id="rt-cadence" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCE_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rt-day">Tekrar Günü</Label>
              {fields.cadence === "weekly" ? (
                <Select
                  value={String(fields.day_of_week ?? 1)}
                  onValueChange={(v) => {
                    if (typeof v === "string") set({ day_of_week: Number(v) });
                  }}
                  items={Object.fromEntries(DOW_LABELS.map((label, i) => [String(i), label]))}
                >
                  <SelectTrigger id="rt-day" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOW_LABELS.map((label, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={String(fields.day_of_month ?? 1)}
                  onValueChange={(v) => {
                    if (typeof v === "string") set({ day_of_month: Number(v) });
                  }}
                  items={Object.fromEntries(DAY_OF_MONTH_OPTIONS.map((d) => [String(d), `Ayın ${d}. günü`]))}
                >
                  <SelectTrigger id="rt-day" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_OF_MONTH_OPTIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        Ayın {d}. günü
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rt-amount-type">Tutar Tipi</Label>
              <Select
                value={fields.amount_type}
                onValueChange={(v) => {
                  if (typeof v === "string") set({ amount_type: v as RecurringExpenseAmountType });
                }}
                items={RECURRING_EXPENSE_AMOUNT_TYPE_LABELS}
              >
                <SelectTrigger id="rt-amount-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AMOUNT_TYPE_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rt-amount">{amountLabel}</Label>
              <Input
                id="rt-amount"
                inputMode="decimal"
                value={fields.amount}
                onChange={(e) => set({ amount: e.target.value })}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rt-start">Başlangıç Tarihi</Label>
              <Input
                id="rt-start"
                type="date"
                value={fields.start_date}
                onChange={(e) => set({ start_date: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rt-end">Bitiş Tarihi — opsiyonel</Label>
              <Input
                id="rt-end"
                type="date"
                value={fields.end_date}
                onChange={(e) => set({ end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rt-desc">Açıklama — opsiyonel</Label>
            <Textarea
              id="rt-desc"
              value={fields.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rt-note">Not — opsiyonel</Label>
            <Textarea
              id="rt-note"
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
