"use client";

/**
 * The "Yeni Anımsatıcı" line at the end of a list: type, press Enter, keep
 * typing. Whatever view it sits in decides the new reminder's list and the
 * defaults that make it show up right there (today's date in "Bugün", the
 * flag in "Bayraklı").
 */
import { Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createReminderAction } from "@/features/reminders/application/reminder-actions";
import { cn } from "@/lib/utils";

export interface QuickAddDefaults {
  readonly list_id: string;
  readonly due_date?: string;
  readonly flagged?: boolean;
}

export function ReminderQuickAdd({
  defaults,
  color,
}: {
  defaults: QuickAddDefaults;
  /** Hex of the list the reminder will land in. */
  color: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [saving, startSaving] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = title.trim();
    if (trimmed === "" || saving) return;
    startSaving(async () => {
      const result = await createReminderAction({ ...defaults, title: trimmed });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setTitle("");
      router.refresh();
      // Stay in the field: adding several in a row is the common case.
      inputRef.current?.focus();
    });
  };

  return (
    <form
      className="flex items-center gap-1 pl-1"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center" style={{ color }}>
        <Plus aria-hidden className="size-5" />
      </span>
      <input
        ref={inputRef}
        aria-label="Yeni anımsatıcı"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={submit}
        placeholder="Yeni Anımsatıcı"
        maxLength={200}
        enterKeyHint="done"
        className={cn(
          "h-9 w-full min-w-0 bg-transparent text-[0.95rem] outline-none placeholder:text-muted-foreground/70",
          saving && "opacity-60",
        )}
      />
    </form>
  );
}
