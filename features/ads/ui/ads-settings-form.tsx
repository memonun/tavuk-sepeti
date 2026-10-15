"use client";

/**
 * The owner's spending limits for ad automation. The cap is edited in lira;
 * the action converts to kuruş. Everything here is enforced on the server
 * before each change Claude makes, so this form IS the safety setting.
 */
import { useActionState, useState } from "react";

import {
  updateAdsSettingsAction,
  type UpdateAdsSettingsState,
} from "@/features/ads/application/ads-settings-actions";
import type { AdsSettings } from "@/features/ads/domain/ads-settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: UpdateAdsSettingsState = { status: "idle" };

export function AdsSettingsForm({ settings }: { settings: AdsSettings }) {
  const [state, formAction, pending] = useActionState(updateAdsSettingsAction, initialState);
  const [enabled, setEnabled] = useState(settings.automationEnabled);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3">
        <Checkbox
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(checked === true)}
          disabled={pending}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium">Reklam otomasyonu açık</span>
          <span className="text-sm text-muted-foreground">
            {enabled
              ? "Claude aşağıdaki limitler içinde bütçe değiştirebilir, reklam açıp durdurabilir ve yeni reklam oluşturabilir."
              : "Kapalı: hiçbir bütçe, durum ya da yeni reklam değişikliği yapılmaz. Acil durumda bunu kapatıp kaydedin."}
          </span>
        </span>
      </label>
      {/* Unchecked checkboxes are not submitted; send the state explicitly. */}
      <input type="hidden" name="automation_enabled" value={enabled ? "true" : "false"} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ads-cap">Günlük toplam bütçe tavanı (₺)</Label>
        <Input
          id="ads-cap"
          name="daily_cap_try"
          defaultValue={String(settings.dailyCapMinor / 100).replace(".", ",")}
          inputMode="decimal"
          disabled={pending}
          className="max-w-40"
        />
        <p className="text-xs text-muted-foreground">
          Yayındaki bütün reklamların günlük bütçeleri toplamı bunu aşamaz. Meta bazı günler bütçenin biraz üstüne çıkıp haftalık ortalamada dengeler.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ads-increase">Tek seferde en fazla artış (%)</Label>
        <Input
          id="ads-increase"
          name="max_increase_pct"
          type="number"
          min={1}
          max={500}
          defaultValue={settings.maxIncreasePct}
          disabled={pending}
          className="max-w-28"
        />
        <p className="text-xs text-muted-foreground">Bir bütçe bir değişiklikte en fazla bu kadar artar. Düşürmeye sınır yok.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ads-changes">Bir reklama günde en fazla değişiklik</Label>
        <Input
          id="ads-changes"
          name="max_changes_per_entity_per_day"
          type="number"
          min={1}
          max={20}
          defaultValue={settings.maxChangesPerEntityPerDay}
          disabled={pending}
          className="max-w-28"
        />
        <p className="text-xs text-muted-foreground">Meta her bütçe değişikliğinden sonra kısa bir öğrenme dönemine girer; sık dokunmak sonuçları bozar.</p>
      </div>

      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="text-sm text-primary" role="status">
          Limitler kaydedildi.
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}
