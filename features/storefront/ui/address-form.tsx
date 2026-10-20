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
 * A CARGO address needs none of that — a courier delivers anywhere in Türkiye
 * from the written address alone — but it gets the same map, because picking a
 * point is how the fields get filled without typing. There the pin is optional:
 * it is saved if placed, and nothing blocks the save if it is not.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2Icon, MapPinIcon } from "lucide-react";

import { AddressAutocomplete } from "@/components/address/address-autocomplete";
import { AddressMapsProvider } from "@/components/address/address-maps-provider";
import { AddressPinCorrector } from "@/components/address/address-pin-corrector";
import { Checkbox } from "@/components/ui/checkbox";
import { geocodeAddressAction } from "@/features/geocoding/application/geocode-address-action";
import { reverseGeocodeAction } from "@/features/geocoding/application/reverse-geocode-action";
import { saveAddressAction } from "@/features/storefront/application/save-address";
import { ShopButton } from "@/features/storefront/ui/kit/shop-button";
import { ShopInput } from "@/features/storefront/ui/kit/shop-field";
import { DETACHED_HOUSE_APARTMENT_NO } from "@/features/storefront/domain/customer-address.schema";
import type { MissingField } from "@/features/storefront/domain/checkout-missing";
import {
  DELIVERY_PROVINCE,
  DELIVERY_PROVINCE_CENTER,
} from "@/features/storefront/domain/storefront.config";
import { composeGeocoderQuery, hasGeocodableShape } from "@/shared/utils/address";

import type { ParsedAddress } from "@/components/address/address-autocomplete";
import type { SavedAddress } from "@/features/storefront/application/list-addresses";
import type { CoordinateAccuracy, CoordinateSource } from "@/shared/geo/coordinate";

/** The fields this form collects, before anything is persisted. */
export interface CollectedAddress {
  label: string;
  city: string;
  district: string;
  neighborhood: string;
  street: string;
  building_no: string;
  apartment_no: string;
  postal_code: string;
  description: string;
  lat: number;
  lng: number;
  source: CoordinateSource;
  accuracy: CoordinateAccuracy;
}

export interface AddressFormProps {
  mode: "route" | "cargo";
  mapsKey: string | undefined;
  /**
   * Present when editing an address that already has values — a saved address
   * (has `id`/`is_primary`/`geo_verified`) or a guest's already-collected
   * address (has none of those; nothing is persisted yet). Either way the
   * form pre-fills from it instead of opening blank, which is what "Adresi
   * düzenle" promises.
   */
  initial?: SavedAddress | CollectedAddress;
  onSaved: (addressId: string) => void;
  onCancel?: () => void;
  /**
   * Guest checkout: hand the collected fields UP instead of saving them.
   *
   * A guest has no `customers` row yet — `upsert_customer_address` resolves the
   * customer from `auth_user_id` and would raise P0002 — so their address cannot
   * exist before the order does. It travels with the order submit instead, and
   * `place_guest_order` writes customer, address and order in one transaction.
   * When set, `onSaved` is never called and nothing is persisted here.
   *
   * Called LIVE, with no button (owner decision 2026-10-20: the address goes in
   * as the customer types it): the complete address once every required field
   * is filled (and, for a route basket, the pin confirmed), otherwise `null`
   * plus what is still missing (name, field id, sentence), which the checkout
   * lists next to its submit button. Must be referentially stable — it is an
   * effect dependency.
   */
  onCollect?: (
    address: CollectedAddress | null,
    missing: readonly MissingField[],
  ) => void;
  /** Collect mode: mark the missing fields red, each with its sentence. The
   *  checkout turns this on once the customer has pressed its submit button. */
  showMissing?: boolean;
  /** Route mode: where "konumumu bulamıyorum" sends the customer (the
   *  checkout's WhatsApp order link). */
  helpHref?: string;
}

/** Scroll targets for the checkout's "what is missing" list. */
const MAP_ID = "af-map";
const CONFIRM_ID = "af-confirm";

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
  onCollect,
  showMissing = false,
  helpHref,
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
  // Editing an already-verified SAVED address starts confirmed (geo_verified
  // says so explicitly). A guest's CollectedAddress has no such flag, but if
  // it already carries a pin it could only have gotten here already confirmed
  // — canSubmit required that the first time — so a pin implies confirmed. A
  // brand new address (no `initial` at all) never starts confirmed.
  const [confirmed, setConfirmed] = useState(
    initial
      ? "geo_verified" in initial
        ? Boolean(initial.geo_verified)
        : initial.lat !== 0 || initial.lng !== 0
      : false,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  // Guards against a slow lookup landing after a newer one and overwriting
  // state with a stale result. Shared by both directions of the map/fields
  // sync (pin → fields reverse geocode, and fields → pin forward geocode)
  // since either can race the other and both write to the same state.
  const lookupSeq = useRef(0);

  const set = (patch: Partial<FormFields>) =>
    setFields((prev) => ({ ...prev, ...patch }));

  const hasPin = pin.lat !== 0 || pin.lng !== 0;
  const needsPin = mode === "route";
  // Guest checkout (onCollect set) requires all address fields, not just route mode.
  const requiresAllFields = !!onCollect;
  const canSubmit = !saving && (!needsPin || (hasPin && confirmed));

  // ---- Guest checkout: live collection (see `onCollect`) ---------------------
  const collected = useMemo<CollectedAddress>(
    () => ({
      ...fields,
      apartment_no: detached ? DETACHED_HOUSE_APARTMENT_NO : fields.apartment_no,
      lat: hasPin ? pin.lat : 0,
      lng: hasPin ? pin.lng : 0,
      accuracy: pin.accuracy,
      source: pin.source,
    }),
    [fields, detached, hasPin, pin],
  );
  // The same fields the inputs below mark `required` in collect mode, in the
  // order the customer meets them on screen (the map leads in route mode and
  // trails in cargo mode), named the way their labels read.
  const collectMissing = useMemo<readonly MissingField[]>(() => {
    const pinMissing: MissingField[] =
      needsPin && !hasPin
        ? [
            {
              label: "haritadan teslimat konumu",
              target: MAP_ID,
              message: "Haritada evinizin yerine dokunun ya da adresinizi aşağıya yazın.",
            },
          ]
        : [];
    const fieldMissing: MissingField[] = [];
    const need = (value: string, label: string, target: string, message: string) => {
      if (value.trim() === "") fieldMissing.push({ label, target, message });
    };
    need(fields.city, "İl", "af-city", "İlinizi yazın.");
    need(fields.district, "İlçe", "af-district", "İlçenizi yazın.");
    need(fields.neighborhood, "Mahalle", "af-neighborhood", "Mahallenizi yazın.");
    need(fields.street, "Cadde / Sokak", "af-street", "Cadde veya sokak adını yazın.");
    need(fields.building_no, "Bina no", "af-building", "Bina numarasını yazın.");
    if (!detached) {
      need(
        fields.apartment_no,
        "Daire no",
        "af-apartment",
        "Daire numarasını yazın. Müstakil evse alttaki kutuyu işaretleyin.",
      );
    }
    const confirmMissing: MissingField[] =
      needsPin && hasPin && !confirmed
        ? [
            {
              label: "haritadaki konumun onayı",
              target: CONFIRM_ID,
              message: "Haritadaki konum doğruysa \"Evet, evim burası\" düğmesine basın.",
            },
          ]
        : [];
    return needsPin
      ? [...pinMissing, ...confirmMissing, ...fieldMissing]
      : [...fieldMissing, ...pinMissing, ...confirmMissing];
  }, [fields, detached, needsPin, hasPin, confirmed]);
  /** Field id → sentence, shown under the field once `showMissing` is on. */
  const missingByTarget = useMemo(() => {
    const byTarget = new Map<string, string>();
    if (onCollect && showMissing) {
      for (const field of collectMissing) {
        if (!byTarget.has(field.target)) byTarget.set(field.target, field.message);
      }
    }
    return byTarget;
  }, [onCollect, showMissing, collectMissing]);
  /** aria wiring for a field that may be shown as missing. */
  const invalid = (id: string) =>
    missingByTarget.has(id)
      ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` }
      : {};
  useEffect(() => {
    if (!onCollect) return;
    onCollect(collectMissing.length === 0 ? collected : null, collectMissing);
  }, [onCollect, collected, collectMissing]);

  function applySuggestion(place: ParsedAddress) {
    // Same blank-keeps-old-value rule as fillFromPin: a search result that
    // only resolves to province/district level must not wipe out a
    // neighborhood/street the map (or a previous search) already filled in.
    // This is what lets "Malatya Akçadağ Bahri" + a map pick, or the other
    // order, both land on the same address instead of one overwriting the
    // other's fields with blanks.
    set({
      city: place.city || fields.city,
      district: place.district || fields.district,
      neighborhood: place.neighborhood || fields.neighborhood,
      street: place.street || fields.street,
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

  /**
   * Dropped pin → filled fields.
   *
   * Anything Google names is overwritten — the pin is the newer statement of
   * intent, and the customer can still edit every field afterwards. What it
   * does with a BLANK differs by field, on purpose:
   *
   *   - bina no / posta kodu are point-specific, so a blank clears them.
   *     Carrying the previous door's number over to a new pin is the one error
   *     a customer would not think to check.
   *   - il / ilçe / mahalle / cadde keep their old value when Google returns
   *     nothing. These are required, and silently emptying them would turn a
   *     thin geocoder result into a form that refuses to save.
   *
   * `label` and `description` are the customer's own words and never touched.
   *
   * A failure is deliberately soft — the pin still stands and the fields stay
   * editable, so a Google outage costs precision, not the order.
   */
  const fillFromPin = useCallback(async (lat: number, lng: number) => {
    const seq = ++lookupSeq.current;
    setLookupError(null);
    const result = await reverseGeocodeAction({ lat, lng });
    if (seq !== lookupSeq.current) return; // a newer pin already won

    if (!result.ok) {
      setLookupError(result.message);
      return;
    }
    const a = result.address;
    setFields((prev) => ({
      ...prev,
      city: a.city || prev.city,
      district: a.district || prev.district,
      neighborhood: a.neighborhood || prev.neighborhood,
      street: a.street || prev.street,
      building_no: a.building_no,
      postal_code: a.postal_code,
    }));
  }, []);

  /**
   * Stable by design — `AddressPinCorrector` is memoized, and an inline arrow
   * here would give it a new prop on every keystroke and defeat that entirely.
   * Everything it touches is a setter or a ref, so it needs no dependencies.
   */
  const handlePinChange = useCallback(
    (next: { lat: number; lng: number; source: CoordinateSource }) => {
      setPin({
        lat: next.lat,
        lng: next.lng,
        accuracy: "rooftop",
        source: next.source,
      });
      setConfirmed(false);
      void fillFromPin(next.lat, next.lng);
    },
    [fillFromPin],
  );

  /**
   * Typed fields → moved pin, the other half of the map/fields sync.
   *
   * A customer typing "Malatya, Akçadağ, Bahri..." by hand (no search, no map
   * tap yet) previously left the map sitting on the province-wide default
   * center — there was no path from typing to a pin at all. Once il + ilçe +
   * (mahalle or cadde) are present, this debounces a forward geocode and
   * drops the pin there, same as the admin customer form already does.
   *
   * Stops the moment the customer takes over the pin themselves — by tapping
   * the map, dragging it, or picking a search suggestion (`source` becomes
   * `"user_pin"` / `"geocoded_manual"`). From then on typing only edits text;
   * it never yanks a deliberately placed pin out from under them. `building_no`
   * is included because it sharpens the geocode; `apartment_no`/`postal_code`/
   * `label`/`description` are excluded so those keystrokes don't burn a Google
   * call for no positional gain (CLAUDE.md §8 quota discipline).
   */
  useEffect(() => {
    const parts = {
      city: fields.city,
      district: fields.district,
      neighborhood: fields.neighborhood,
      street: fields.street,
      building_no: fields.building_no,
    };
    if (!hasGeocodableShape(parts)) return;
    if (hasPin && pin.source !== "geocoded_auto") return;

    const timer = setTimeout(async () => {
      const seq = ++lookupSeq.current;
      const result = await geocodeAddressAction(composeGeocoderQuery(parts));
      if (seq !== lookupSeq.current) return; // a newer edit/pin already won
      if (!result.ok) return; // soft-fail — the customer can still tap the map by hand

      setPin({
        lat: result.lat,
        lng: result.lng,
        accuracy: result.accuracy,
        source: "geocoded_auto",
      });
      setConfirmed(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [
    fields.city,
    fields.district,
    fields.neighborhood,
    fields.street,
    fields.building_no,
    hasPin,
    pin.source,
  ]);

  async function submit() {
    setError(null);

    // Only a SAVED address (from AddressPicker's "Düzenle") has an id/is_primary
    // to carry forward — a guest's CollectedAddress never reaches here at all:
    // in collect mode there is no button, the effect above hands it up live.
    const savedInitial = initial && "id" in initial ? initial : undefined;

    setSaving(true);
    const result = await saveAddressAction({
      addressId: savedInitial?.id ?? null,
      mode,
      // Editing keeps whatever the address already was. A NEW one does not
      // claim the default: `upsert_customer_address` already promotes the very
      // first address on its own, so forcing it here only meant that adding a
      // one-off address (a gift, a work drop) silently moved the default —
      // and the next checkout then preselected the address least likely to be
      // wanted. Choosing it for THIS order is the picker's job, not a flag on
      // the row.
      makePrimary: savedInitial ? savedInitial.is_primary : false,
      address: {
        ...fields,
        apartment_no: detached
          ? DETACHED_HOUSE_APARTMENT_NO
          : fields.apartment_no,
        // Sent in BOTH modes now. A cargo order does not need the pin, but the
        // customer placed one on the map and the address book keeps it, so the
        // same address can serve a fresh-product order later instead of being
        // rejected for "no pin".
        ...(hasPin
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

  const mapBlock = (
    <AddressMapsProvider
      apiKey={mapsKey}
      fallback={
        needsPin ? (
          <p className="rounded-2xl border border-destructive/40 bg-(--shop-red-soft) p-4 text-base leading-relaxed font-semibold text-destructive">
            {`Harita yüklenemedi. ${DELIVERY_PROVINCE} içi teslimat için konum onayı gerektiğinden şu an bu adres kaydedilemiyor.`}
          </p>
        ) : (
          // Cargo does not depend on the map, so a missing key is a downgrade,
          // not a dead end: the fields below are still fully usable by hand.
          <p className="rounded-2xl bg-muted p-4 text-base leading-relaxed text-foreground">
            Harita şu an kullanılamıyor — adres alanlarını elle
            doldurabilirsiniz.
          </p>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {/* Map first: picking the point is the fast path, and it fills every
            field below, so the customer edits pre-filled text instead of
            typing an address from scratch on a phone. */}
        <div id={MAP_ID} className="flex flex-col gap-2">
        <AddressPinCorrector
          lat={hasPin ? pin.lat : DELIVERY_PROVINCE_CENTER.lat}
          lng={hasPin ? pin.lng : DELIVERY_PROVINCE_CENTER.lng}
          hasPin={hasPin}
          accuracy={pin.accuracy}
          // The customer placed this pin on their own door — that is what
          // lets an approximate geocode be accepted at all (CLAUDE.md §8).
          pinSource="user_pin"
          hint={
            !hasPin
              ? "Haritada teslimat konumunuzu seçin — adres bilgileri otomatik doldurulsun."
              : needsPin
                ? "Pini kapınızın tam önüne sürükleyin, sonra aşağıdan onaylayın."
                : "Pini sürükleyerek konumu düzeltebilirsiniz."
          }
          onChange={handlePinChange}
        />
        <FieldError id={MAP_ID} message={missingByTarget.get(MAP_ID)} />
        </div>

        {lookupError ? (
          <p className="text-base text-muted-foreground" role="status">
            {lookupError}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <label htmlFor="af-search" className={labelClass}>
            veya adres arayın
          </label>
          <AddressAutocomplete
            id="af-search"
            onSelect={applySuggestion}
            placeholder="Mahalle, cadde veya sokak adı"
            disabled={saving}
          />
        </div>

        {/* A big "yes" button instead of the old small checkbox: our older
            customers missed the box, and "Evet, evim burası" says what the
            confirmation means. Moving the pin un-confirms it (handlePinChange). */}
        {needsPin && hasPin ? (
          confirmed ? (
            <p className="flex items-start gap-3 rounded-2xl border-2 border-primary bg-(--shop-green-soft) px-4 py-3 text-base leading-relaxed font-semibold text-foreground">
              <CheckCircle2Icon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
              <span>
                Konum onaylandı. Kurye bu noktaya gelecek. Yanlışsa pini haritada
                sürükleyin.
              </span>
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <ShopButton
                id={CONFIRM_ID}
                size="lg"
                block
                onClick={() => setConfirmed(true)}
                disabled={saving}
                {...invalid(CONFIRM_ID)}
              >
                <CheckCircle2Icon className="size-6" aria-hidden />
                Evet, evim burası
              </ShopButton>
              <FieldError id={CONFIRM_ID} message={missingByTarget.get(CONFIRM_ID)} />
            </div>
          )
        ) : null}

        {needsPin && !hasPin ? (
          <p className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-base leading-relaxed text-foreground">
            <MapPinIcon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              {`${DELIVERY_PROVINCE} içi teslimat için konumunuzu haritadan seçip onaylayın.`}
            </span>
          </p>
        ) : null}

        {needsPin && helpHref ? (
          <p className="text-base leading-relaxed text-foreground">
            Konumunuzu haritada bulamıyor musunuz?{" "}
            <a
              href={helpHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline underline-offset-4"
            >
              WhatsApp&apos;tan yazın
            </a>
            , siparişinizi birlikte alalım.
          </p>
        ) : null}
      </div>
    </AddressMapsProvider>
  );

  // Cargo: the map is optional, so the fields lead — typing an address is
  // what our older customers know; the map below is there for whoever wants
  // it. Route: the pin is the point of the form, so the map stays first.
  const mapSection = needsPin ? (
    mapBlock
  ) : (
    <div className="flex flex-col gap-3">
      <p className={labelClass}>Haritada işaretlemek isterseniz (isteğe bağlı)</p>
      {mapBlock}
    </div>
  );

  return (
    // `shop-address`: the hook theme.css uses to bring the map's hint and the
    // address search box (shared components, also used by the admin) up to
    // the shop's sizes without editing those files.
    <div className="shop-address flex flex-col gap-5 rounded-3xl border border-border bg-card p-4 sm:p-5">
      {needsPin ? mapSection : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* An address book name means nothing to a guest, who has no book. */}
        {onCollect ? null : (
          <Field label="Adres adı (ör. Ev, İş)" htmlFor="af-label">
            <ShopInput
              id="af-label"
              value={fields.label}
              onChange={(e) => set({ label: e.target.value })}
              placeholder="Ev"
              disabled={saving}
            />
          </Field>
        )}
        <Field label="İl" htmlFor="af-city" error={missingByTarget.get("af-city")}>
          <ShopInput
            id="af-city"
            {...invalid("af-city")}
            value={fields.city}
            onChange={(e) => set({ city: e.target.value })}
            autoComplete="address-level1"
            required
            disabled={saving}
          />
        </Field>
        <Field label="İlçe" htmlFor="af-district" error={missingByTarget.get("af-district")}>
          <ShopInput
            id="af-district"
            {...invalid("af-district")}
            value={fields.district}
            onChange={(e) => set({ district: e.target.value })}
            autoComplete="address-level2"
            required
            disabled={saving}
          />
        </Field>
        <Field label="Mahalle" htmlFor="af-neighborhood" error={missingByTarget.get("af-neighborhood")}>
          <ShopInput
            id="af-neighborhood"
            {...invalid("af-neighborhood")}
            value={fields.neighborhood}
            onChange={(e) => set({ neighborhood: e.target.value })}
            required
            disabled={saving}
          />
        </Field>
        <Field
          label={needsPin || requiresAllFields ? "Cadde / Sokak" : "Cadde / Sokak (opsiyonel)"}
          htmlFor="af-street"
          error={missingByTarget.get("af-street")}
        >
          <ShopInput
            id="af-street"
            {...invalid("af-street")}
            value={fields.street}
            onChange={(e) => set({ street: e.target.value })}
            autoComplete="address-line1"
            required={needsPin || requiresAllFields}
            disabled={saving}
          />
        </Field>
        <Field label={needsPin || requiresAllFields ? "Bina no" : "Bina no (opsiyonel)"} htmlFor="af-building" error={missingByTarget.get("af-building")}>
          <ShopInput
            id="af-building"
            {...invalid("af-building")}
            value={fields.building_no}
            onChange={(e) => set({ building_no: e.target.value })}
            required={needsPin || requiresAllFields}
            disabled={saving}
          />
        </Field>
        <Field label={needsPin || requiresAllFields ? "Daire no" : "Daire no (opsiyonel)"} htmlFor="af-apartment" error={missingByTarget.get("af-apartment")}>
          <div className="flex flex-col gap-2">
            <ShopInput
              id="af-apartment"
              {...invalid("af-apartment")}
              value={detached ? "" : fields.apartment_no}
              onChange={(e) => set({ apartment_no: e.target.value })}
              required={(needsPin || requiresAllFields) && !detached}
              disabled={saving || detached}
              placeholder={detached ? DETACHED_HOUSE_APARTMENT_NO : ""}
            />
            {/* A detached house genuinely has no flat number. Recording that
                explicitly beats leaving the field blank, which would make the
                stop show a red "Daire" warning on every route forever. */}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-foreground">
              <Checkbox
                checked={detached}
                onCheckedChange={setDetached}
                className={checkboxClass}
                disabled={saving}
              />
              Müstakil ev — daire numarası yok
            </label>
          </div>
        </Field>
        {/* Optional, and a courier finds the door without it — one less box
            for a guest to wonder about. */}
        {onCollect ? null : (
          <Field label="Posta kodu (opsiyonel)" htmlFor="af-postal">
            <ShopInput
              id="af-postal"
              value={fields.postal_code}
              onChange={(e) => set({ postal_code: e.target.value })}
              autoComplete="postal-code"
              inputMode="numeric"
              disabled={saving}
            />
          </Field>
        )}
        <Field label="Adres tarifi (opsiyonel)" htmlFor="af-desc">
          <ShopInput
            id="af-desc"
            value={fields.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Kapı kodu, kat, bina rengi vb."
            disabled={saving}
          />
        </Field>
      </div>

      {needsPin ? null : mapSection}

      {error ? (
        <p
          className="rounded-2xl border border-destructive/40 bg-(--shop-red-soft) p-4 text-base font-semibold text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* Collect mode has no button: the address is handed up as it is typed
          (see `onCollect`). */}
      {onCollect ? null : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <ShopButton size="lg" onClick={submit} disabled={!canSubmit}>
            {saving ? "Kaydediliyor…" : "Adresi kaydet"}
          </ShopButton>
          {onCancel ? (
            <ShopButton size="lg" variant="quiet" onClick={onCancel} disabled={saving}>
              Vazgeç
            </ShopButton>
          ) : null}
        </div>
      )}

      {needsPin && hasPin && !confirmed ? (
        <p className="rounded-2xl bg-(--shop-apricot-soft) p-4 text-base font-semibold text-foreground">
          {onCollect
            ? "Devam etmek için haritadaki konumu onaylayın."
            : "Kaydetmek için haritadaki konumu onaylayın."}
        </p>
      ) : null}
    </div>
  );
}

/** Same label and checkbox treatment as the rest of the checkout
 *  (checkout-form.tsx): dark bold labels, 28px boxes. */
const labelClass = "text-base font-bold text-foreground";
const checkboxClass =
  "mt-0.5 size-7 rounded-md border-2 border-(--shop-field-border) [&_svg]:size-5";

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  /** Shown under the control, in red, when the field is missing. */
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      <FieldError id={htmlFor} message={error} />
    </div>
  );
}

/** The sentence under a missing field; `id` matches the control's
 *  `aria-describedby`. */
function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} className="text-base font-semibold text-destructive">
      {message}
    </p>
  );
}
