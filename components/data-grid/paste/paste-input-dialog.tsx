"use client";

/**
 * First step of the bulk-paste flow: collect the clipboard payload.
 *
 * navigator.clipboard.readText needs an explicit user permission grant
 * (and the page has to be focused). Instead of fighting that, we open a
 * small dialog with an autofocused textarea — Cmd+V into the textarea
 * always works, no permission prompt. The parsed payload then flows into
 * the existing PastePreviewDialog.
 */
import { useEffect, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PasteInputDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly entityLabel: string;
  readonly onSubmit: (text: string) => void;
}

export function PasteInputDialog({
  open,
  onOpenChange,
  entityLabel,
  onSubmit,
}: PasteInputDialogProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      // Drop any leftover paste text so reopening the dialog starts clean.
      // Synchronous setState inside the effect is fine here — it's a
      // controlled reset on a side-effect-free state slice.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText("");
      return;
    }
    queueMicrotask(() => textareaRef.current?.focus());
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Toplu {entityLabel} ekle</DialogTitle>
          <DialogDescription>
            Excel veya Sheets&apos;te sütunları kopyala, aşağıya{" "}
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">⌘V</kbd>{" "}
            ile yapıştır. Sıralama: tablonun ilk N kolonu (Ad, Soyad, Telefon,
            …).
          </DialogDescription>
        </DialogHeader>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Buraya yapıştır…"
          rows={8}
          className="w-full resize-none rounded-md border bg-background p-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button
            type="button"
            disabled={text.trim().length === 0}
            onClick={() => onSubmit(text)}
          >
            Önizle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
