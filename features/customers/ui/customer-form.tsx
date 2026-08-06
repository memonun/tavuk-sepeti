"use client";

/**
 * Customer create / edit form.
 *
 * Address is captured as a Türkiye-standard structured payload:
 * il / ilçe / mahalle / cadde / bina no / daire no / posta kodu / tarif.
 * The form is the single source of truth — when enough fields are present
 * (city + district + neighborhood-or-street), the composed string is sent
 * to `geocodeAddressAction` to fetch a coordinate, and the pin corrector
 * lets the admin drag the marker if Google's auto-pin is off.
 *
 * Submit dispatches the createCustomer or updateCustomer Server Action.
 * Form state is managed by react-hook-form with the same Zod schema the
 * server action uses — invariants stay aligned across the boundary.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { APIProvider } from "@vis.gl/react-google-maps";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { AddressAutocomplete } from "@/components/address/address-autocomplete";
import { AddressPinCorrector } from "@/components/address/address-pin-corrector";
import { createCustomerAction } from "@/features/customers/application/create-customer";
import { updateCustomerAction } from "@/features/customers/application/update-customer";
import { customerFormSchema } from "@/features/customers/domain/customer.schema";
import { geocodeAddressAction } from "@/features/geocoding/application/geocode-address-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { composeGeocoderQuery, hasGeocodableShape } from "@/shared/utils/address";

import type { ParsedAddress } from "@/components/address/address-autocomplete";
import type {
  CustomerFormInput,
  CustomerFormParsed,
} from "@/features/customers/domain/customer.schema";
import type { CoordinateAccuracy, CoordinateSource } from "@/shared/geo/coordinate";

interface CustomerFormProps {
  mapsBrowserKey: string;
  mode:
    | { kind: "create" }
    | { kind: "edit"; customerId: string; defaultValues: CustomerFormInput };
}

export function CustomerForm({ mapsBrowserKey, mode }: CustomerFormProps) {
  const router = useRouter();
  const [submitting, startSubmitting] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [geocodingState, setGeocodingState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready" }
  >({ kind: "idle" });

  const isEdit = mode.kind === "edit";

  const form = useForm<CustomerFormInput, unknown, CustomerFormParsed>({
    resolver: zodResolver(customerFormSchema),
    mode: "onBlur",
    defaultValues: isEdit
      ? mode.defaultValues
      : {
          first_name: "",
          last_name: "",
          email: "",
          phone: "",
          notes: "",
          status: "active",
          address: {
            city: "",
            district: "",
            neighborhood: "",
            street: "",
            building_no: "",
            apartment_no: "",
            postal_code: "",
            description: "",
            lat: 0,
            lng: 0,
            source: "geocoded_auto",
            accuracy: "unknown",
          },
        },
  });

  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { errors },
  } = form;

  // Watch the structured subset that drives geocoding. We deliberately
  // omit description / apartment_no / postal_code from the trigger so an
  // admin tweaking those alone doesn't burn a Google call.
const city = watch("address.city");
const district = watch("address.district");
const neighborhood = watch("address.neighborhood");
const street = watch("address.street");
const buildingNo = watch("address.building_no");
const apartmentNo = watch("address.apartment_no");
const postalCode = watch("address.postal_code");
const addressLat = watch("address.lat");
const addressLng = watch("address.lng");
const addressSource = watch("address.source");
const addressAccuracy = watch("address.accuracy");

  const hasCoordinate =
    typeof addressLat === "number" &&
    typeof addressLng === "number" &&
    !(addressLat === 0 && addressLng === 0);

  // Debounced geocoding when the structured shape becomes geocodable.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const parts = {
      city,
      district,
      neighborhood,
      street,
      building_no: buildingNo,
      apartment_no: apartmentNo,
      postal_code: postalCode,
    };
    if (!hasGeocodableShape(parts)) {
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setGeocodingState({ kind: "loading" });
      const result = await geocodeAddressAction(composeGeocoderQuery(parts));
      if (result.ok) {
        // Don't overwrite a coordinate the admin set deliberately — pin drag
        // ("admin_corrected" / "user_pin"), the lat/lng inputs ("admin_corrected"),
        // or an autocomplete pick ("geocoded_manual").
        if (
          addressSource === "admin_corrected" ||
          addressSource === "geocoded_manual" ||
          addressSource === "user_pin"
        ) {
          setGeocodingState({ kind: "ready" });
          return;
        }
        setValue("address.lat", result.lat, { shouldValidate: true });
        setValue("address.lng", result.lng, { shouldValidate: true });
        setValue("address.source", result.source, { shouldValidate: true });
        setValue("address.accuracy", result.accuracy, { shouldValidate: true });
        setGeocodingState({ kind: "ready" });
      } else {
        setGeocodingState({ kind: "error", message: result.message });
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // addressSource is intentionally omitted: we only want to re-geocode
    // when the admin types, not when source flips after a pin drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, district, neighborhood, street, buildingNo, apartmentNo, postalCode, setValue]);

  // Fill the structured fields + coordinate from a Google Places pick. We mark
  // the coordinate "geocoded_manual" (admin chose a candidate) so the debounced
  // auto-geocode below won't overwrite it.
  const handleAutocompleteSelect = (a: ParsedAddress) => {
    if (a.city) setValue("address.city", a.city, { shouldValidate: true });
    if (a.district) setValue("address.district", a.district, { shouldValidate: true });
    if (a.neighborhood)
      setValue("address.neighborhood", a.neighborhood, { shouldValidate: true });
    if (a.street) setValue("address.street", a.street, { shouldValidate: true });
    if (a.building_no)
      setValue("address.building_no", a.building_no, { shouldValidate: true });
    if (a.postal_code)
      setValue("address.postal_code", a.postal_code, { shouldValidate: true });
    if (a.lat && a.lng) {
      setValue("address.lat", a.lat, { shouldValidate: true });
      setValue("address.lng", a.lng, { shouldValidate: true });
      setValue("address.source", "geocoded_manual", { shouldValidate: true });
      setValue("address.accuracy", "rooftop", { shouldValidate: true });
    }
  };

  const onPinChange = (next: {
    lat: number;
    lng: number;
    source: CoordinateSource;
  }) => {
    setValue("address.lat", next.lat, { shouldValidate: true });
    setValue("address.lng", next.lng, { shouldValidate: true });
    setValue("address.source", next.source, { shouldValidate: true });
    // Admin-corrected pins land at "rooftop" accuracy by convention — admin
    // has visually placed it on the building.
    setValue("address.accuracy", "rooftop" as CoordinateAccuracy, {
      shouldValidate: true,
    });
  };

  const onSubmit = handleSubmit((parsed) => {
    setSubmitError(null);
    startSubmitting(async () => {
      const formData = new FormData();
      const addr = parsed.address ?? null;
      formData.set("first_name", parsed.first_name ?? "");
      formData.set("last_name", parsed.last_name ?? "");
      formData.set("email", parsed.email ?? "");
      formData.set("phone", parsed.phone ?? "");
      formData.set("notes", parsed.notes ?? "");
      formData.set("status", parsed.status);
      formData.set("address.city", addr?.city ?? "");
      formData.set("address.district", addr?.district ?? "");
      formData.set("address.neighborhood", addr?.neighborhood ?? "");
      formData.set("address.street", addr?.street ?? "");
      formData.set("address.building_no", addr?.building_no ?? "");
      formData.set("address.apartment_no", addr?.apartment_no ?? "");
      formData.set("address.postal_code", addr?.postal_code ?? "");
      formData.set("address.description", addr?.description ?? "");
      formData.set("address.lat", String(addr?.lat ?? 0));
      formData.set("address.lng", String(addr?.lng ?? 0));
      formData.set("address.source", addr?.source ?? "");
      formData.set("address.accuracy", addr?.accuracy ?? "");

      const result =
        mode.kind === "create"
          ? await createCustomerAction({ status: "idle" }, formData)
          : await updateCustomerAction(mode.customerId, { status: "idle" }, formData);

      switch (result.status) {
        case "success":
          router.push(`/customers/${result.customerId}`);
          router.refresh();
          return;
        case "validation_error":
          setSubmitError("Form alanlarını kontrol et.");
          return;
        case "error":
          setSubmitError(result.message);
          return;
        case "idle":
          // Action only ever returns idle on the initial useActionState call,
          // not as the result of a dispatch — defensive only.
          return;
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="@container space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT — identity + contact + notes */}
        <div className="space-y-4">
          <Field label="Ad" error={errors.first_name?.message}>
            <Input id="first_name" {...register("first_name")} />
          </Field>
          <Field label="Soyad" error={errors.last_name?.message}>
            <Input id="last_name" {...register("last_name")} />
          </Field>
          <Field label="Telefon" error={errors.phone?.message}>
            <Input id="phone" {...register("phone")} />
          </Field>
          <Field label="E-posta (opsiyonel)" error={errors.email?.message}>
            <Input id="email" type="email" {...register("email")} />
          </Field>
          <Field label="Durum" error={errors.status?.message}>
            <Select
              value={watch("status") ?? "active"}
              onValueChange={(value) =>
                setValue("status", value as "active" | "inactive" | "blocked", {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Pasif</SelectItem>
                <SelectItem value="blocked">Engelli</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notlar" error={errors.notes?.message}>
            <textarea
              id="notes"
              rows={3}
              className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
              {...register("notes")}
            />
          </Field>
        </div>

        {/* RIGHT — address, stacked top-to-bottom in a card */}
        <AddressSection hasProvider={mapsBrowserKey.length > 0} apiKey={mapsBrowserKey}>
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Adres</h3>

            <Field
              label="Adres (yazmaya başla, Google önerir)"
              error={errors.address?.street?.message}
            >
              {mapsBrowserKey ? (
                <AddressAutocomplete
                  value={typeof street === "string" ? street : ""}
                  onChange={(v) =>
                    setValue("address.street", v, { shouldValidate: true })
                  }
                  onSelect={handleAutocompleteSelect}
                  placeholder="Cadde / sokak, mahalle…"
                />
              ) : (
                <Input id="address.street" {...register("address.street")} />
              )}
            </Field>
            <Field label="İl" error={errors.address?.city?.message}>
              <Input id="address.city" {...register("address.city")} />
            </Field>
            <Field label="İlçe" error={errors.address?.district?.message}>
              <Input id="address.district" {...register("address.district")} />
            </Field>
            <Field label="Mahalle" error={errors.address?.neighborhood?.message}>
              <Input id="address.neighborhood" {...register("address.neighborhood")} />
            </Field>
            <Field label="Bina No" error={errors.address?.building_no?.message}>
              <Input id="address.building_no" {...register("address.building_no")} />
            </Field>
            <Field label="Daire" error={errors.address?.apartment_no?.message}>
              <Input id="address.apartment_no" {...register("address.apartment_no")} />
            </Field>
            <Field label="Posta Kodu" error={errors.address?.postal_code?.message}>
              <Input id="address.postal_code" {...register("address.postal_code")} />
            </Field>
            <Field
              label="Adres tarifi (kapı kodu, bina rengi vb.)"
              error={errors.address?.description?.message}
            >
              <Input id="address.description" {...register("address.description")} />
            </Field>

            {geocodingState.kind === "loading" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Adres haritada bulunuyor…
              </p>
            ) : null}
            {geocodingState.kind === "error" ? (
              <p className="text-sm text-destructive">{geocodingState.message}</p>
            ) : null}

            <Field label="Enlem (lat)">
              <Input
                inputMode="decimal"
                value={addressLat && addressLat !== 0 ? String(addressLat) : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setValue("address.lat", Number.isFinite(n) ? n : 0, { shouldValidate: true });
                  setValue("address.source", "admin_corrected", { shouldValidate: true });
                  setValue("address.accuracy", "rooftop", { shouldValidate: true });
                }}
              />
            </Field>
            <Field label="Boylam (lng)">
              <Input
                inputMode="decimal"
                value={addressLng && addressLng !== 0 ? String(addressLng) : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setValue("address.lng", Number.isFinite(n) ? n : 0, { shouldValidate: true });
                  setValue("address.source", "admin_corrected", { shouldValidate: true });
                  setValue("address.accuracy", "rooftop", { shouldValidate: true });
                }}
              />
            </Field>

            {mapsBrowserKey && hasCoordinate ? (
              <AddressPinCorrector
                lat={addressLat}
                lng={addressLng}
                accuracy={addressAccuracy ?? "unknown"}
                // An admin moving the pin is a correction, not the resident
                // placing their own door — the storefront passes "user_pin".
                pinSource="admin_corrected"
                onChange={onPinChange}
              />
            ) : null}
          </section>
        </AddressSection>
      </div>

      {submitError ? (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={submitting}
        >
          İptal
        </Button>
        <Button type="submit" disabled={submitting || !hasCoordinate}>
          {submitting ? "Kaydediliyor…" : isEdit ? "Güncelle" : "Müşteri Oluştur"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Lifts a single `<APIProvider>` over the whole address body so the Google
 * Places autocomplete and the pin map share one script load + billing session.
 * When no browser maps key is configured we render the children bare — the
 * structured address fields still work, the Google-dependent pieces are
 * already gated on `mapsBrowserKey` at their call sites.
 */
function AddressSection({
  hasProvider,
  apiKey,
  children,
}: {
  hasProvider: boolean;
  apiKey: string;
  children: React.ReactNode;
}) {
  if (!hasProvider) {
    return <div className="space-y-3">{children}</div>;
  }
  return (
    <APIProvider apiKey={apiKey}>
      <div className="space-y-3">{children}</div>
    </APIProvider>
  );
}

interface FieldProps {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}

function Field({ label, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
