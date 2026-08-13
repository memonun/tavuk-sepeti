"use client";

/**
 * The admin half of "eve servis günlerini değiştirebileyim".
 *
 * Two rules, one form: which weekdays the van goes out, and the floor for an
 * out-of-city (cargo) order. Both are read by the storefront on every checkout,
 * so a save here changes what customers can pick on the next request — the
 * action invalidates the cached read.
 *
 * The money field is edited in LİRA and submitted in kuruş: the owner thinks in
 * "1000 ₺", the system stores minor units (CLAUDE.md §7), and the conversion
 * belongs at this edge rather than in anyone's head.
 */
import { useActionState, useState } from "react";

import {
  updateStorefrontSettingsAction,
  type UpdateStorefrontSettingsState,
} from "@/features/storefront/application/update-storefront-settings";
import {
  WEEKDAYS_TR_ORDER,
  WEEKDAY_NAMES_TR,
  type Weekday,
} from "@/features/storefront/domain/delivery-window";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTRY } from "@/shared/utils/money";

const initialState: UpdateStorefrontSettingsState = { status: "idle" };

export interface StorefrontSettingsFormProps {
  homeDeliveryDays: readonly Weekday[];
  cargoMinOrderMinor: number;
}

export function StorefrontSettingsForm({
  homeDeliveryDays,
  cargoMinOrderMinor,
}: StorefrontSettingsFormProps) {
  const [state, formAction, pending] = useActionState(
    updateStorefrontSettingsAction,
    initialState,
  );
  // Controlled so the form can refuse to submit an empty day list before the
  // round-trip, and so the ₺ preview tracks what is typed.
  const [days, setDays] = useState<readonly Weekday[]>(homeDeliveryDays);
  const [minMajor, setMinMajor] = useState(
    (cargoMinOrderMinor / 100).toString(),
  );

  const parsedMajor = Number(minMajor.replace(",", "."));
  const minMinor = Number.isFinite(parsedMajor)
    ? Math.round(parsedMajor * 100)
    : Number.NaN;
  const minValid = Number.isFinite(minMinor) && minMinor >= 0;

  function toggleDay(day: Weekday) {
    setDays((previous) =>
      previous.includes(day)
        ? previous.filter((d) => d !== day)
        : [...previous, day],
    );
  }

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Eve servis günleri</legend>
        <p className="text-sm text-muted-foreground">
          Müşteriler ödeme sayfasında yalnızca bu günleri seçebilir. Değişiklik
          kaydedildiği anda mağazada geçerli olur; mevcut siparişler etkilenmez.
        </p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS_TR_ORDER.map((day) => {
            const checked = days.includes(day);
            return (
              <label
                key={day}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm transition-colors has-checked:border-primary has-checked:bg-secondary/60"
              >
                <input
                  type="checkbox"
                  name="home_delivery_days"
                  value={day}
                  checked={checked}
                  onChange={() => toggleDay(day)}
                  className="size-4 accent-primary"
                  disabled={pending}
                />
                {WEEKDAY_NAMES_TR[day]}
              </label>
            );
          })}
        </div>
        {days.length === 0 ? (
          <p className="text-sm text-destructive" role="alert">
            En az bir gün seçin — hiç gün seçilmezse taze ürün siparişi
            verilemez.
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cargo-min">Şehir dışı (kargo) sipariş alt limiti (₺)</Label>
        <Input
          id="cargo-min"
          value={minMajor}
          onChange={(event) => setMinMajor(event.target.value)}
          inputMode="decimal"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          {minValid
            ? `Kargo siparişlerinde en az ${formatTRY(minMinor)} tutarında sepet gerekir. 0 yazarsanız limit kalkar.`
            : "Geçerli bir tutar girin (ör. 1000)."}
        </p>
        {/* The action parses kuruş; the visible field is lira. */}
        <input
          type="hidden"
          name="cargo_min_order_minor"
          value={minValid ? minMinor : ""}
        />
      </div>

      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="text-sm text-primary" role="status">
          Ayarlar kaydedildi.
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending || days.length === 0 || !minValid}>
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}
