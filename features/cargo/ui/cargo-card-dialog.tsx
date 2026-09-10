"use client";

/**
 * "Kargo Kartı" — one tap on a queue row, one screen with just what the
 * carrier asks for at hand-off: recipient name, phone, address. Deliberately
 * NOT the order detail page (that answers "what's in the order"). Large type
 * so it reads at arm's length across a counter; every field is copyable and
 * the phone is tap-to-call.
 *
 * DialogTrigger uses the base-ui `render` prop pattern (not shadcn's asChild).
 */

import { Contact } from "lucide-react";
import { type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatTRPhone } from "@/shared/utils/phone";

import type { CargoRecipient } from "@/features/cargo/domain/cargo-recipient";

interface CargoCardDialogProps {
  readonly orderNumber: string;
  readonly recipient: CargoRecipient | undefined;
}

export function CargoCardDialog({ orderNumber, recipient }: CargoCardDialogProps) {
  if (!recipient) return null;

  const { name, phone, address, addressNote } = recipient;
  const phoneDisplay = formatTRPhone(phone);
  const allText = [name, phoneDisplay, address, addressNote]
    .filter((line): line is string => Boolean(line) && line !== "—")
    .join("\n");

  return (
    <Dialog>
      <DialogTrigger
        render={
          (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" />
          ) as ReactElement
        }
      >
        <Contact className="h-3.5 w-3.5" />
        Kargo Kartı
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kargo Kartı · {orderNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Ad Soyad" value={name} copyValue={name} />
          <Field
            label="Telefon"
            value={phoneDisplay}
            copyValue={phone ?? undefined}
            href={phone ? `tel:${phone}` : undefined}
          />
          <Field
            label="Adres"
            value={address}
            note={addressNote}
            copyValue={address}
          />

          {allText.length > 0 ? (
            <div className="flex justify-end pt-1">
              <CopyButton value={allText} label="Hepsini kopyala" />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly note?: string | null | undefined;
  readonly copyValue?: string | undefined;
  readonly href?: string | undefined;
}

function Field({ label, value, note, copyValue, href }: FieldProps) {
  const canCopy = Boolean(copyValue) && value !== "—";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {canCopy ? (
          <CopyButton value={copyValue as string} className="h-7 px-2 text-xs" />
        ) : null}
      </div>
      {href ? (
        <a
          href={href}
          className="block text-lg font-semibold text-primary underline-offset-4 hover:underline"
        >
          {value}
        </a>
      ) : (
        <p className="text-lg font-semibold leading-snug">{value}</p>
      )}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
    </div>
  );
}
