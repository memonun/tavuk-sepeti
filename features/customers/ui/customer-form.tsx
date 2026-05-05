"use client";

/**
 * Customer create / edit form.
 *
 * Behavior:
 *   - Address text blur (debounced) calls `geocodeAddressAction` and
 *     populates lat/lng/source/accuracy.
 *   - The pin corrector lets the admin drag the marker; that flips source
 *     to "admin_corrected".
 *   - Submit dispatches the createCustomer or updateCustomer Server Action.
 *
 * Form state is managed by react-hook-form with the same Zod schema the
 * server action uses — invariants stay aligned across the boundary.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { AddressPinCorrector } from "@/features/customers/ui/address-pin-corrector";
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
            raw_text: "",
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

  const addressText = watch("address.raw_text");
  const addressLat = watch("address.lat");
  const addressLng = watch("address.lng");
  const addressSource = watch("address.source");
  const addressAccuracy = watch("address.accuracy");
  const hasCoordinate =
    typeof addressLat === "number" &&
    typeof addressLng === "number" &&
    !(addressLat === 0 && addressLng === 0);

  // Debounced geocoding on address text change.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!addressText || addressText.trim().length < 5) {
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setGeocodingState({ kind: "loading" });
      const result = await geocodeAddressAction(addressText);
      if (result.ok) {
        // Don't overwrite an admin's manual pin correction.
        if (addressSource === "admin_corrected") {
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
    // addressSource is intentionally omitted: we only want to re-geocode when
    // the user types, not when the source flag flips after a pin drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressText, setValue]);

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
      formData.set("first_name", parsed.first_name);
      formData.set("last_name", parsed.last_name);
      formData.set("email", parsed.email ?? "");
      formData.set("phone", parsed.phone);
      formData.set("notes", parsed.notes ?? "");
      formData.set("status", parsed.status);
      formData.set("address.raw_text", parsed.address.raw_text);
      formData.set("address.description", parsed.address.description ?? "");
      formData.set("address.lat", String(parsed.address.lat));
      formData.set("address.lng", String(parsed.address.lng));
      formData.set("address.source", parsed.address.source);
      formData.set("address.accuracy", parsed.address.accuracy);

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
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <Field label="Ad" error={errors.first_name?.message}>
          <Input id="first_name" {...register("first_name")} />
        </Field>
        <Field label="Soyad" error={errors.last_name?.message}>
          <Input id="last_name" {...register("last_name")} />
        </Field>
        <Field label="Telefon" error={errors.phone?.message}>
          <Input id="phone" placeholder="0532 123 45 67" {...register("phone")} />
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
      </section>

      <section className="space-y-3">
        <Field label="Adres" error={errors.address?.raw_text?.message}>
          <textarea
            id="address.raw_text"
            rows={3}
            className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
            {...register("address.raw_text")}
          />
        </Field>
        <Field label="Adres notu (kapı, bina rengi vb.)" error={errors.address?.description?.message}>
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

        {hasCoordinate ? (
          <AddressPinCorrector
            apiKey={mapsBrowserKey}
            lat={addressLat}
            lng={addressLng}
            accuracy={addressAccuracy}
            onChange={onPinChange}
          />
        ) : null}
      </section>

      <Field label="Notlar" error={errors.notes?.message}>
        <textarea
          id="notes"
          rows={3}
          className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
          {...register("notes")}
        />
      </Field>

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
