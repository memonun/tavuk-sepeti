"use client";

/**
 * Create / edit form for a single recurring template.
 *
 * Pattern mirrors features/orders/ui/order-detail-panel.tsx's OrderEditForm:
 *   useState + useTransition + direct action call (NOT useActionState).
 */

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createRecurringTemplateAction,
  updateRecurringTemplateAction,
} from "@/features/recurring/application/recurring-template-actions";
import { RecurringItemsPicker } from "@/features/recurring/ui/recurring-items-picker";
import { todayInIstanbul } from "@/shared/utils/date";

import type { Product } from "@/features/products/application/list-products";
import type {
  RecurringCadence,
  RecurringTemplate,
  RecurringTemplateItem,
} from "@/features/recurring/domain/recurring-template";

interface RecurringTemplateFormProps {
  readonly customerId: string;
  readonly products: Product[];
  readonly template?: RecurringTemplate;
  readonly onSaved: (t: RecurringTemplate) => void;
  readonly onCancel?: () => void;
}

const DOW_LABELS = ["Pzr", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

export function RecurringTemplateForm({
  customerId,
  products,
  template,
  onSaved,
  onCancel,
}: RecurringTemplateFormProps) {
  const isCreate = template == null;

  const [saving, startSaving] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [cadence, setCadence] = useState<RecurringCadence>(
    template?.cadence ?? "weekly",
  );
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(
    template?.day_of_week ?? 1,
  );
  const [dayOfMonth, setDayOfMonth] = useState<number | null>(
    template?.day_of_month ?? 1,
  );
  const [paymentMethod, setPaymentMethod] = useState<string>(
    template?.payment_method ?? "cash_on_delivery",
  );
  const [active, setActive] = useState<boolean>(template?.active ?? true);
  const [firstRunAt, setFirstRunAt] = useState<string>(todayInIstanbul());
  const [items, setItems] = useState<RecurringTemplateItem[]>(
    template?.items ? [...template.items] : [],
  );
  const [itemsError, setItemsError] = useState<string | undefined>(undefined);

  const handleCadenceChange = (next: RecurringCadence) => {
    setCadence(next);
    if (next === "monthly") {
      setDayOfWeek(null);
      if (dayOfMonth == null) setDayOfMonth(1);
    } else {
      setDayOfMonth(null);
      if (dayOfWeek == null) setDayOfWeek(1);
    }
  };

  const handleSubmit = () => {
    setFormError(null);
    setSaved(false);
    setItemsError(undefined);

    if (items.length === 0) {
      setItemsError("En az bir ürün gerekli.");
      return;
    }

    const raw: Record<string, unknown> = {
      customer_id: customerId,
      cadence,
      day_of_week: cadence === "monthly" ? null : dayOfWeek,
      day_of_month: cadence === "monthly" ? dayOfMonth : null,
      items,
      payment_method: paymentMethod,
      active,
    };

    if (isCreate) {
      raw.first_run_at = firstRunAt;
    }

    startSaving(async () => {
      const result = isCreate
        ? await createRecurringTemplateAction(raw)
        : await updateRecurringTemplateAction(template.id, raw);

      if (result.ok) {
        setSaved(true);
        onSaved(result.value);
        return;
      }
      setFormError(result.error.message);
    });
  };

  return (
    <div className="space-y-5">
      {/* Cadence */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cadence">Periyot</Label>
        <select
          id="cadence"
          value={cadence}
          onChange={(e) => handleCadenceChange(e.target.value as RecurringCadence)}
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <option value="weekly">Haftalık</option>
          <option value="biweekly">İki haftada bir</option>
          <option value="monthly">Aylık</option>
        </select>
      </div>

      {/* Day selector — mutually exclusive based on cadence */}
      {cadence === "monthly" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="day_of_month">Ayın günü</Label>
          <select
            id="day_of_month"
            value={dayOfMonth ?? 1}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {DAY_OF_MONTH_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}.
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label>Haftanın günü</Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Haftanın günü">
            {DOW_LABELS.map((label, idx) => (
              <button
                key={label}
                type="button"
                onClick={() => setDayOfWeek(idx)}
                aria-pressed={dayOfWeek === idx}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  dayOfWeek === idx
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-muted",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Payment method */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment_method">Ödeme yöntemi</Label>
        <select
          id="payment_method"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <option value="cash_on_delivery">Kapıda nakit</option>
          <option value="bank_transfer">Havale</option>
        </select>
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-3">
        <input
          id="active"
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded border border-input accent-primary"
        />
        <Label htmlFor="active" className="cursor-pointer select-none">
          Aktif
        </Label>
      </div>

      {/* First run date (create only) */}
      {isCreate ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="first_run_at">İlk teslimat tarihi</Label>
          <Input
            id="first_run_at"
            type="date"
            value={firstRunAt}
            onChange={(e) => setFirstRunAt(e.target.value)}
          />
        </div>
      ) : null}

      {/* Items */}
      <div className="flex flex-col gap-1.5">
        <Label>Ürünler</Label>
        <RecurringItemsPicker
          products={products}
          items={items}
          onChange={setItems}
          error={itemsError}
        />
      </div>

      {/* Error / success feedback */}
      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      {saved && !formError ? (
        <p className="text-sm text-emerald-600" role="status">
          Kaydedildi.
        </p>
      ) : null}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            İptal
          </Button>
        ) : null}
        <Button type="button" onClick={handleSubmit} disabled={saving}>
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </div>
  );
}
