"use client";

/**
 * Customer-facing delivery-address editor.
 *
 * This is where "müşteriden rota için gereken her bilgiyi kendisi girsin"
 * actually happens. For a ROUTE address the customer:
 *
 *   1. picks their street from Google Places (fills il/ilçe/mahalle/cadde/bina
 *      in one tap, so they usually only type the flat number),
 *   2. drags the pin onto their own door,
 *   3. ticks the confirmation.
 *
 * Steps 2–3 are what the van depends on. The confirmation checkbox is required
 * even when the geocoder returned a rooftop-accurate point — the person standing
 * at the address is the only one who can tell us the pin is on the right door,
 * and CLAUDE.md §8 forbids saving an `approximate` coordinate without it. The
 * schema enforces the same rule server-side (source must be "user_pin" when the
 * accuracy is low), so a tampered submit gains nothing.
 *
 * A CARGO address needs none of that: a courier delivers anywhere in Türkiye
 * from the written address alone, so the map is not rendered at all.
 */
import { useState } from "react";
import { MapPinIcon } from "lucide-react";

import { AddressAutocomplete } from "@/components/address/address-autocomplete";
import { AddressMapsProvider } from "@/components/address/address-maps-provider";
import { AddressPinCorrector } from "@/components/address/address-pin-corrector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAddressAction } from "@/features/storefront/application/save-address";
import { DETACHED_HOUSE_APARTMENT_NO } from "@/features/storefront/domain/customer-address.schema";
import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";

import type { ParsedAddress } from "@/components/address/address-autocomplete";
import type { SavedAddress } from "@/features/storefront/application/list-addresses";
import type { CoordinateAccuracy, CoordinateSource } from "@/shared/geo/coordinate";

export interface AddressFormProps {
  mode: "route" | "cargo";
  mapsKey: string | undefined;
  /** Present when editing an existing address. */
  initial?: SavedAddress;
  onSaved: (addressId: string) => void;
  onCancel?: () => void;
}

interface FormFields {
  label: string;
  city: string;
  district: string;
  neighborhood: string;
  street: string;
  building_no: string;
  apartment_no: string;
  postal_code: string;
  description: string;
}

const emptyFields: FormFields = {
  label: "",
  city: "",
  district: "",
  neighborhood: "",
  street: "",
  building_no: "",
  apartment_no: "",
  postal_code: "",
  description: "",
};

export function AddressForm({
  mode,
  mapsKey,
  initial,
  onSaved,
  onCancel,
}: AddressFormProps) {
  const [fields, setFields] = useState<FormFields>(
    initial
      ? {
          label: initial.label ?? "",
          city: initial.city,
          district: initial.district,
          neighborhood: initial.neighborhood,
          street: initial.street,
          building_no: initial.building_no,
          apartment_no: initial.apartment_no,
          postal_code: initial.postal_code,
          description: initial.description,
        }
      : { ...emptyFields, city: mode === "route" ? DELIVERY_PROVINCE : "" },
  );
  const [pin, setPin] = useState<{
    lat: number;
    lng: number;
    accuracy: CoordinateAccuracy;
    source: CoordinateSource;
  }>(
    initial && initial.lat !== 0
      ? {
          lat: initial.lat,
          lng: initial.lng,
          accuracy: initial.accuracy,
          source: initial.source,
        }
      : { lat: 0, lng: 0, accuracy: "unknown", source: "user_pin" },
  );
  const [detached, setDetached] = useState(
    initial?.apartment_no === DETACHED_HOUSE_APARTMENT_NO,
  );
  // Editing an already-verified address starts confirmed; a new one never does.
  const [confirmed, setConfirmed] = useState(Boolean(initial?.geo_verified));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<FormFields>) =>
    setFields((prev) => ({ ...prev, ...patch }));

  const hasPin = pin.lat !== 0 || pin.lng !== 0;
  const needsPin = mode === "route";
  const canSubmit = !saving && (!needsPin || (hasPin && confirmed));

  function applySuggestion(place: ParsedAddress) {
    set({
      city: place.city || fields.city,
      district: place.district,
      neighborhood: place.neighborhood,
      street: place.street,
      building_no: place.building_no,
      postal_code: place.postal_code,
    });
    if (place.lat !== 0 || place.lng !== 0) {
      // A geocoder hit is a starting point, not a confirmation — the customer
      // still has to look at the map and say "yes, that's my door".
      setPin({
        lat: place.lat,
        lng: place.lng,
        accuracy: "rooftop",
        source: "geocoded_manual",
      });
      setConfirmed(false);
    }
  }

  async function submit() {
    setError(null);
    setSaving(true);
    const result = await saveAddressAction({
      addressId: initial?.id ?? null,
      mode,
      makePrimary: !initial || initial.is_primary,
      address: {
        ...fields,
        apartment_no: detached
          ? DETACHED_HOUSE_APARTMENT_NO
          : fields.apartment_no,
        ...(mode === "route"
          ? {
              lat: pin.lat,
              lng: pin.lng,
              accuracy: pin.accuracy,
              source: pin.source,
            }
          : {}),
      },
    });
    setSaving(false);

    if (result.status === "success") {
      onSaved(result.addressId);
      return;
    }
    if (result.status === "validation_error" || result.status === "error") {
      setError(result.message);
    }
  }

  const mapBlock = needsPin ? (
    <AddressMapsProvider
      apiKey={mapsKey}
      fallback={
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Harita yüklenemedi. Taze ürün siparişi için konum onayı gerektiğinden
          şu an bu adres kaydedilemiyor.
        </p>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-search" className="text-muted-foreground">
            Adres ara
          </Label>
          <AddressAutocomplete
            id="af-search"
            onSelect={applySuggestion}
            placeholder="Mahalle, cadde veya sokak adı yazın"
            disabled={saving}
          />
        </div>

        {hasPin ? (
          <>
            <AddressPinCorrector
              lat={pin.lat}
              lng={pin.lng}
              accuracy={pin.accuracy}
              // The customer placed this pin on their own door — that is what
              // lets an approximate geocode be accepted at all (CLAUDE.md §8).
              pinSource="user_pin"
              hint="Pini kapınızın tam önüne sürükleyin, sonra aşağıdan onaylayın."
              onChange={(next) => {
                setPin({
                  lat: next.lat,
                  lng: next.lng,
                  accuracy: "rooftop",
                  source: next.source,
                });
                setConfirmed(false);
              }}
            />
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-input p-3 text-sm has-checked:border-primary has-checked:bg-secondary/50">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
                disabled={saving}
              />
              <span>
                Haritadaki konum teslimat adresim. Kurye/dağıtım bu noktaya
                gelecek.
              </span>
            </label>
          </>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
            <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span>
              Adresinizi yukarıdan arayın — haritada konumunuzu onaylamanız
              gerekiyor.
            </span>
          </p>
        )}
      </div>
    </AddressMapsProvider>
  ) : null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4">
      {mapBlock}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Adres adı (ör. Ev, İş)" htmlFor="af-label">
          <Input
            id="af-label"
            value={fields.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="Ev"
            disabled={saving}
          />
        </Field>
        <Field label="İl" htmlFor="af-city">
          <Input
            id="af-city"
            value={fields.city}
            onChange={(e) => set({ city: e.target.value })}
            autoComplete="address-level1"
            required
            disabled={saving}
          />
        </Field>
        <Field label="İlçe" htmlFor="af-district">
          <Input
            id="af-district"
            value={fields.district}
            onChange={(e) => set({ district: e.target.value })}
            autoComplete="address-level2"
            required
            disabled={saving}
          />
        </Field>
        <Field label="Mahalle" htmlFor="af-neighborhood">
          <Input
            id="af-neighborhood"
            value={fields.neighborhood}
            onChange={(e) => set({ neighborhood: e.target.value })}
            required
            disabled={saving}
          />
        </Field>
        <Field
          label={needsPin ? "Cadde / Sokak" : "Cadde / Sokak (opsiyonel)"}
          htmlFor="af-street"
        >
          <Input
            id="af-street"
            value={fields.street}
            onChange={(e) => set({ street: e.target.value })}
            autoComplete="address-line1"
            required={needsPin}
            disabled={saving}
          />
        </Field>
        <Field label={needsPin ? "Bina no" : "Bina no (opsiyonel)"} htmlFor="af-building">
          <Input
            id="af-building"
            value={fields.building_no}
            onChange={(e) => set({ building_no: e.target.value })}
            required={needsPin}
            disabled={saving}
          />
        </Field>
        <Field label={needsPin ? "Daire no" : "Daire no (opsiyonel)"} htmlFor="af-apartment">
          <div className="flex flex-col gap-1.5">
            <Input
              id="af-apartment"
              value={detached ? "" : fields.apartment_no}
              onChange={(e) => set({ apartment_no: e.target.value })}
              required={needsPin && !detached}
              disabled={saving || detached}
              placeholder={detached ? DETACHED_HOUSE_APARTMENT_NO : ""}
            />
            {/* A detached house genuinely has no flat number. Recording that
                explicitly beats leaving the field blank, which would make the
                stop show a red "Daire" warning on every route forever. */}
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={detached}
                onChange={(e) => setDetached(e.target.checked)}
                className="size-3.5 accent-primary"
                disabled={saving}
              />
              Müstakil ev — daire numarası yok
            </label>
          </div>
        </Field>
        <Field label="Posta kodu (opsiyonel)" htmlFor="af-postal">
          <Input
            id="af-postal"
            value={fields.postal_code}
            onChange={(e) => set({ postal_code: e.target.value })}
            autoComplete="postal-code"
            inputMode="numeric"
            disabled={saving}
          />
        </Field>
        <Field label="Adres tarifi (opsiyonel)" htmlFor="af-desc">
          <Input
            id="af-desc"
            value={fields.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Kapı kodu, kat, bina rengi vb."
            disabled={saving}
          />
        </Field>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={submit} disabled={!canSubmit}>
          {saving ? "Kaydediliyor…" : "Adresi kaydet"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Vazgeç
          </Button>
        ) : null}
      </div>

      {needsPin && hasPin && !confirmed ? (
        <p className="text-xs text-muted-foreground">
          Kaydetmek için haritadaki konumu onaylayın.
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
