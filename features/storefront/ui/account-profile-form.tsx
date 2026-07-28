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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTRPhone } from "@/shared/utils/phone";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-medium">{value}</dd>
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
      <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-lg">Bilgilerim</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setEditing(true)}
          >
            Düzenle
          </Button>
        </div>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <Field label="Ad Soyad" value={fullName || "—"} />
          <Field label="E-posta" value={email || "—"} />
          <Field label="Telefon" value={phone ? formatTRPhone(phone) : "—"} />
        </dl>
        {!phone || !fullName ? (
          <p className="mt-4 rounded-xl bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
            Daha hızlı teslimat için eksik bilgilerinizi “Düzenle” ile ekleyin.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
      <h2 className="font-display text-lg">Bilgilerimi düzenle</h2>
      <form action={onSubmit} className="mt-4 flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-first">Ad</Label>
            <Input
              id="ap-first"
              name="first_name"
              defaultValue={firstName}
              autoComplete="given-name"
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-last">Soyad</Label>
            <Input
              id="ap-last"
              name="last_name"
              defaultValue={lastName}
              autoComplete="family-name"
              disabled={pending}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ap-phone">Telefon</Label>
          <Input
            id="ap-phone"
            name="phone"
            type="tel"
            defaultValue={phone}
            autoComplete="tel"
            placeholder="0532 123 45 67"
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ap-email">E-posta</Label>
          <Input id="ap-email" value={email} disabled readOnly />
          <p className="text-xs text-muted-foreground">E-posta değiştirilemez.</p>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            type="submit"
            size="lg"
            className="rounded-full"
            disabled={pending}
          >
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="rounded-full"
            disabled={pending}
            onClick={() => {
              setError(null);
              setEditing(false);
            }}
          >
            Vazgeç
          </Button>
        </div>
      </form>
    </section>
  );
}
