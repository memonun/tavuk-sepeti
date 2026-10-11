"use client";

/**
 * Create / edit dialog for a named, colored container — a reminder list or a
 * calendar. Edit mode also carries the delete button (two-step confirm inside
 * the same dialog, so there is no dialog-over-dialog on a phone). The caller
 * owns the Server Actions; this only collects the name and the color.
 */
import { Loader2, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { AccentColorPicker } from "@/components/accent-color-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ACCENT_COLOR_HEX, type AccentColor } from "@/shared/palette/accent-colors";

export interface NameColorValue {
  readonly name: string;
  readonly color: AccentColor;
}

export interface NameColorDialogText {
  readonly createTitle: string;
  readonly editTitle: string;
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  readonly colorLabel: string;
  /** Shown once the delete button has been pressed the first time. */
  readonly deleteWarning: string;
}

export function NameColorDialog({
  open,
  onOpenChange,
  initial,
  text,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode. */
  initial?: NameColorValue | undefined;
  text: NameColorDialogText;
  /** Resolves true when saved (the dialog then closes). */
  onSave: (value: NameColorValue) => Promise<boolean>;
  /** Edit mode only. Resolves true when deleted. */
  onDelete?: (() => Promise<boolean>) | undefined;
}) {
  const isEdit = initial !== undefined;
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<AccentColor>(initial?.color ?? "blue");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, startTransition] = useTransition();

  // Reset the form each time the dialog opens (render-phase adjustment, React's
  // documented alternative to an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initial?.name ?? "");
      setColor(initial?.color ?? "blue");
      setConfirmingDelete(false);
    }
  }

  const trimmed = name.trim();

  const save = () => {
    if (trimmed === "") return;
    startTransition(async () => {
      if (await onSave({ name: trimmed, color })) onOpenChange(false);
    });
  };

  const remove = () => {
    if (!onDelete) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    startTransition(async () => {
      if (await onDelete()) onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? text.editTitle : text.createTitle}</DialogTitle>
          {confirmingDelete ? (
            <DialogDescription className="text-destructive">{text.deleteWarning}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nc-name">{text.nameLabel}</Label>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: ACCENT_COLOR_HEX[color] }}
              />
              <Input
                id="nc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={text.namePlaceholder}
                maxLength={60}
                autoFocus={!isEdit}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{text.colorLabel}</Label>
            <AccentColorPicker value={color} onChange={setColor} label={text.colorLabel} />
          </div>
        </form>

        <DialogFooter className={cn(isEdit && onDelete && "sm:justify-between")}>
          {isEdit && onDelete ? (
            <Button
              type="button"
              variant={confirmingDelete ? "destructive" : "ghost"}
              onClick={remove}
              disabled={busy}
              className="gap-1.5"
            >
              <Trash2 className="size-3.5" />
              {confirmingDelete ? "Evet, sil" : "Sil"}
            </Button>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose render={<Button variant="outline" disabled={busy} />}>İptal</DialogClose>
            <Button type="button" onClick={save} disabled={busy || trimmed === ""} className="gap-1.5">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {isEdit ? "Kaydet" : "Ekle"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
