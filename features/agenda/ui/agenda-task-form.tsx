"use client";

/**
 * Create/edit dialog for an agenda task — same pattern as
 * features/finance/ui/expense-form.tsx: useState + useTransition + direct
 * Server Action call, sonner toasts on the Result. Edit mode also carries
 * the delete button (two-step confirm inside the same dialog, so there's no
 * dialog-over-dialog on a phone).
 */
import { Loader2, Plus, Repeat, Trash2 } from "lucide-react";
import { type ReactElement, type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createAgendaTaskAction,
  deleteAgendaTaskAction,
  updateAgendaTaskAction,
} from "@/features/agenda/application/agenda-task-actions";
import {
  AGENDA_CATEGORIES,
  AGENDA_CATEGORY_LABELS,
  describeRepeatRule,
  type AgendaCategory,
  type AgendaTask,
  type RepeatUnit,
} from "@/features/agenda/domain/agenda-task";
import { AGENDA_CATEGORY_DOT } from "@/features/agenda/ui/agenda-category-style";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type RepeatChoice = RepeatUnit | "none";

interface FieldsState {
  title: string;
  category: AgendaCategory;
  due_date: string;
  repeat: RepeatChoice;
  repeat_every: string;
  notes: string;
}

function initialFields(task: AgendaTask | undefined, defaults: Partial<FieldsState>): FieldsState {
  if (task) {
    return {
      title: task.title,
      category: task.category,
      due_date: task.due_date ?? "",
      repeat: task.repeat?.unit ?? "none",
      repeat_every: String(task.repeat?.every ?? 1),
      notes: task.notes ?? "",
    };
  }
  return {
    title: "",
    category: "genel",
    due_date: "",
    repeat: "none",
    repeat_every: "1",
    notes: "",
    ...defaults,
  };
}

// Base UI's Select resolves the trigger's label only from this `items` map,
// never from the popup's rendered SelectItem children.
const REPEAT_CHOICE_LABELS: Readonly<Record<RepeatChoice, string>> = {
  none: "Tekrar yok",
  day: "Günlük",
  week: "Haftalık",
  month: "Aylık",
};
const REPEAT_CHOICES = Object.keys(REPEAT_CHOICE_LABELS) as RepeatChoice[];

const REPEAT_EVERY_LABELS: Readonly<Record<RepeatUnit, string>> = {
  day: "Kaç günde bir?",
  week: "Kaç haftada bir?",
  month: "Kaç ayda bir?",
};

export function AgendaTaskFormDialog({
  mode,
  task,
  defaultDueDate,
  defaultCategory,
  trigger,
}: {
  mode: "create" | "edit";
  task?: AgendaTask | undefined;
  /** Create mode: pre-fills the date (the day column's "+" button). */
  defaultDueDate?: string | undefined;
  /** Create mode: pre-fills the category (the active category filter). */
  defaultCategory?: AgendaCategory | undefined;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const defaults: Partial<FieldsState> = {
    ...(defaultDueDate !== undefined ? { due_date: defaultDueDate } : {}),
    ...(defaultCategory !== undefined ? { category: defaultCategory } : {}),
  };
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<FieldsState>(() => initialFields(task, defaults));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, startSaving] = useTransition();

  const set = (patch: Partial<FieldsState>) => setFields((prev) => ({ ...prev, ...patch }));

  const onOpenChange = (next: boolean) => {
    if (next) {
      setFields(initialFields(task, defaults));
      setConfirmingDelete(false);
    }
    setOpen(next);
  };

  const repeatEvery = Number.parseInt(fields.repeat_every, 10);
  const repeatPreview =
    fields.repeat !== "none" && Number.isInteger(repeatEvery) && repeatEvery >= 1
      ? describeRepeatRule({ unit: fields.repeat, every: repeatEvery })
      : null;

  const submit = () => {
    if (fields.title.trim() === "") {
      toast.error("İş adı gerekli.");
      return;
    }
    if (fields.repeat !== "none") {
      if (repeatPreview === null) {
        toast.error("Tekrar aralığı 1 veya daha büyük bir tam sayı olmalı.");
        return;
      }
      if (fields.due_date === "") {
        toast.error("Tekrarlayan iş için bir başlangıç tarihi seçin.");
        return;
      }
    }

    const payload = {
      title: fields.title,
      category: fields.category,
      due_date: fields.due_date === "" ? null : fields.due_date,
      repeat_unit: fields.repeat === "none" ? null : fields.repeat,
      repeat_every: fields.repeat === "none" ? null : repeatEvery,
      notes: fields.notes,
    };

    startSaving(async () => {
      const result =
        mode === "create"
          ? await createAgendaTaskAction(payload)
          : await updateAgendaTaskAction({ ...payload, id: task!.id });

      if (result.ok) {
        toast.success(mode === "create" ? "İş eklendi." : "İş güncellendi.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const remove = () => {
    if (!task) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    startSaving(async () => {
      const result = await deleteAgendaTaskAction({ id: task.id });
      if (result.ok) {
        toast.success("İş silindi.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger as ReactElement} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isCreate ? "İş Ekle" : "İşi düzenle"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="at-title">İş</Label>
            <Input
              id="at-title"
              value={fields.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="ör. Kümes temizliği, Newcastle aşısı"
              maxLength={200}
              autoFocus={isCreate}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="at-category">Kategori</Label>
              <Select
                value={fields.category}
                onValueChange={(v) => {
                  if (typeof v === "string") set({ category: v as AgendaCategory });
                }}
                items={AGENDA_CATEGORY_LABELS}
              >
                <SelectTrigger id="at-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENDA_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      <span
                        aria-hidden
                        className={cn("size-2 shrink-0 rounded-full", AGENDA_CATEGORY_DOT[category])}
                      />
                      {AGENDA_CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="at-date">Tarih</Label>
                {fields.due_date !== "" ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => set({ due_date: "" })}
                  >
                    Tarihsiz yap
                  </button>
                ) : null}
              </div>
              <Input
                id="at-date"
                type="date"
                value={fields.due_date}
                onChange={(e) => set({ due_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="at-repeat">Tekrar</Label>
              <Select
                value={fields.repeat}
                onValueChange={(v) => {
                  if (typeof v === "string") set({ repeat: v as RepeatChoice });
                }}
                items={REPEAT_CHOICE_LABELS}
              >
                <SelectTrigger id="at-repeat" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPEAT_CHOICES.map((choice) => (
                    <SelectItem key={choice} value={choice}>
                      {REPEAT_CHOICE_LABELS[choice]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fields.repeat !== "none" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="at-repeat-every">{REPEAT_EVERY_LABELS[fields.repeat]}</Label>
                <Input
                  id="at-repeat-every"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  value={fields.repeat_every}
                  onChange={(e) => set({ repeat_every: e.target.value })}
                />
              </div>
            ) : null}
          </div>

          {repeatPreview !== null ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Repeat className="h-3.5 w-3.5 shrink-0" />
              {repeatPreview}. İşi tamamlayınca bir sonraki otomatik eklenir.
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="at-notes">Not — opsiyonel</Label>
            <Textarea
              id="at-notes"
              value={fields.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="ör. Hangi kümes, ilaç dozu, kimi aramalı"
              maxLength={1000}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className={cn(!isCreate && "sm:justify-between")}>
          {!isCreate ? (
            <Button
              type="button"
              variant={confirmingDelete ? "destructive" : "ghost"}
              onClick={remove}
              disabled={saving}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmingDelete ? "Evet, sil" : "Sil"}
            </Button>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose render={<Button variant="outline" disabled={saving} />}>İptal</DialogClose>
            <Button type="button" onClick={submit} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {isCreate ? "Ekle" : "Kaydet"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Add task" trigger + dialog in one client component. The trigger Button is
 * created here rather than handed in from a Server Component: a server-built
 * <Button> passed to DialogTrigger's `render` hydrates with a mismatched
 * data-slot attribute, which React reports as a hydration error.
 */
export function AgendaAddTaskButton({
  defaultDueDate,
  defaultCategory,
  label,
  iconOnly = false,
}: {
  defaultDueDate?: string | undefined;
  defaultCategory?: AgendaCategory | undefined;
  /** Button text, or the aria-label when `iconOnly`. */
  label: string;
  /** Small ghost "+" (day cards, list headers) instead of the primary button. */
  iconOnly?: boolean;
}) {
  return (
    <AgendaTaskFormDialog
      mode="create"
      defaultDueDate={defaultDueDate}
      defaultCategory={defaultCategory}
      trigger={
        iconOnly ? (
          <Button variant="ghost" size="icon-sm" aria-label={label}>
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" className="shrink-0 gap-1.5">
            <Plus className="h-4 w-4" /> {label}
          </Button>
        )
      }
    />
  );
}
