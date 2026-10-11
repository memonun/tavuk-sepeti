"use client";

/**
 * Account "Bilgilerim" card — read view with an inline edit mode. Editing name
 * + phone posts to updateProfileAction (which writes the shared CRM customer
 * row). Email is auth-owned and shown read-only. The action is driven via a
 * transition (not useActionState) so success/close is handled in the event
 * handler rather than a set-state-in-effect.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateProfileAction } from "@/features/storefront/application/update-profile";
import { formatTRPhone } from "@/shared/utils/phone";
import { ShopButton } from "@/features/storefront/ui/kit/shop-button";
import { ShopInput } from "@/features/storefront/ui/kit/shop-field";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-base uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-bold">{value}</dd>
    </div>
  );
}

export function AccountProfileForm({
  firstName,
  lastName,
  phone,
  email,
}: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fullName = `${firstName} ${lastName}`.trim();

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await updateProfileAction({ status: "idle" }, formData);
      if (result.status === "success") {
        toast.success("Bilgileriniz güncellendi.");
        setEditing(false);
        router.refresh();
      } else if (result.status === "error") {
        setError(result.message);
      }
    });
  };

  if (!editing) {
    return (
      <section className="rounded-3xl border border-border bg-card p-5 shadow-(--shop-shadow-sm) sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl leading-tight">Bilgilerim</h2>
          <ShopButton variant="secondary"
            onClick={() => setEditing(true)}
          >
            Düzenle
          </ShopButton>
        </div>
        <dl className="mt-4 grid gap-4 text-base sm:grid-cols-2">
          <Field label="Ad Soyad" value={fullName || "—"} />
          <Field label="E-posta" value={email || "—"} />
          <Field label="Telefon" value={phone ? formatTRPhone(phone) : "—"} />
        </dl>
        {!phone || !fullName ? (
          <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-base text-muted-foreground">
            Daha hızlı teslimat için eksik bilgilerinizi “Düzenle” ile ekleyin.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-(--shop-shadow-sm) sm:p-6">
      <h2 className="font-display text-2xl leading-tight">Bilgilerimi düzenle</h2>
      <form action={onSubmit} className="mt-4 flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-base font-bold text-foreground" htmlFor="ap-first">Ad</label>
            <ShopInput
              id="ap-first"
              name="first_name"
              defaultValue={firstName}
              autoComplete="given-name"
              disabled={pending}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-base font-bold text-foreground" htmlFor="ap-last">Soyad</label>
            <ShopInput
              id="ap-last"
              name="last_name"
              defaultValue={lastName}
              autoComplete="family-name"
              disabled={pending}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-base font-bold text-foreground" htmlFor="ap-phone">Telefon</label>
          <ShopInput
            id="ap-phone"
            name="phone"
            type="tel"
            defaultValue={phone}
            autoComplete="tel"
            placeholder="0532 123 45 67"
            disabled={pending}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-base font-bold text-foreground" htmlFor="ap-email">E-posta</label>
          <ShopInput id="ap-email" value={email} disabled readOnly />
          <p className="text-base text-muted-foreground">E-posta değiştirilemez.</p>
        </div>

        {error ? (
          <p className="text-base text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <ShopButton
            type="submit" size="lg"
            disabled={pending}
          >
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </ShopButton>
          <ShopButton variant="secondary" size="lg"
            disabled={pending}
            onClick={() => {
              setError(null);
              setEditing(false);
            }}
          >
            Vazgeç
          </ShopButton>
        </div>
      </form>
    </section>
  );
}
