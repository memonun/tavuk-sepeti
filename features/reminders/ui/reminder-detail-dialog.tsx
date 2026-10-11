"use client";

/**
 * The full editor of one reminder — everything the row itself can't show:
 * notes, day and time, repeat, priority, flag and which list it lives in.
 * Laid out as Apple's grouped "Ayrıntılar" sheet. Carries the delete button
 * (two-step confirm inside the same dialog).
 */
import { Loader2, Trash2 } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteReminderAction,
  updateReminderAction,
} from "@/features/reminders/application/reminder-actions";
import { dueParts } from "@/features/reminders/domain/due";
import {
  REMINDER_PRIORITIES,
  REMINDER_PRIORITY_LABELS,
  type Reminder,
  type ReminderList,
  type ReminderPriority,
} from "@/features/reminders/domain/reminder";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ACCENT_COLOR_HEX } from "@/shared/palette/accent-colors";
import { describeRepeatRule, REPEAT_UNITS, type RepeatUnit } from "@/shared/utils/repeat-rule";

type RepeatChoice = RepeatUnit | "none";

// Base UI's Select resolves the trigger's label only from this `items` map,
// never from the popup's rendered SelectItem children.
const REPEAT_CHOICE_LABELS: Readonly<Record<RepeatChoice, string>> = {
  none: "Asla",
  day: "Günlük",
  week: "Haftalık",
  month: "Aylık",
  year: "Yıllık",
};
const REPEAT_CHOICES: readonly RepeatChoice[] = ["none", ...REPEAT_UNITS];

const PRIORITY_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  REMINDER_PRIORITIES.map((p) => [String(p), REMINDER_PRIORITY_LABELS[p]]),
);

interface FieldsState {
  title: string;
  notes: string;
  hasDate: boolean;
  date: string;
  hasTime: boolean;
  time: string;
  repeat: RepeatChoice;
  repeatEvery: string;
  priority: ReminderPriority;
  flagged: boolean;
  listId: string;
}

function initialFields(reminder: Reminder, today: string): FieldsState {
  const { date, time } = dueParts(reminder);
  return {
    title: reminder.title,
    notes: reminder.notes ?? "",
    hasDate: date !== null,
    date: date ?? today,
    hasTime: time !== null,
    time: time ?? "09:00",
    repeat: reminder.repeat?.unit ?? "none",
    repeatEvery: String(reminder.repeat?.every ?? 1),
    priority: reminder.priority,
    flagged: reminder.flagged,
    listId: reminder.list_id,
  };
}

function Group({ children }: { children: ReactNode }) {
  return <div className="divide-y overflow-hidden rounded-xl bg-muted/60">{children}</div>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function ReminderDetailDialog({
  reminder,
  lists,
  today,
  open,
  onOpenChange,
}: {
  reminder: Reminder;
  lists: readonly ReminderList[];
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<FieldsState>(() => initialFields(reminder, today));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, startSaving] = useTransition();

  const set = (patch: Partial<FieldsState>) => setFields((prev) => ({ ...prev, ...patch }));

  // Reset to the stored reminder each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFields(initialFields(reminder, today));
      setConfirmingDelete(false);
    }
  }

  const repeatEvery = Number.parseInt(fields.repeatEvery, 10);
  const repeatValid = Number.isInteger(repeatEvery) && repeatEvery >= 1 && repeatEvery <= 365;
  const repeats = fields.hasDate && fields.repeat !== "none";
  const listLabels = Object.fromEntries(lists.map((list) => [list.id, list.name]));

  const submit = () => {
    if (fields.title.trim() === "") {
      toast.error("Başlık gerekli.");
      return;
    }
    if (repeats && !repeatValid) {
      toast.error("Tekrar aralığı 1 ile 365 arasında bir tam sayı olmalı.");
      return;
    }
    startSaving(async () => {
      const result = await updateReminderAction({
        id: reminder.id,
        list_id: fields.listId,
        title: fields.title,
        notes: fields.notes,
        due_date: fields.hasDate ? fields.date : null,
        due_time: fields.hasDate && fields.hasTime ? fields.time : null,
        repeat_unit: repeats ? fields.repeat : null,
        repeat_every: repeats ? repeatEvery : null,
        priority: fields.priority,
        flagged: fields.flagged,
      });
      if (result.ok) {
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const remove = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    startSaving(async () => {
      const result = await deleteReminderAction({ id: reminder.id });
      if (result.ok) {
        toast.success("Anımsatıcı silindi.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ayrıntılar</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <Group>
            <Input
              aria-label="Başlık"
              value={fields.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Başlık"
              maxLength={200}
              className="h-11 rounded-none border-0 bg-transparent px-3 text-[0.95rem] font-medium shadow-none focus-visible:ring-0"
            />
            <Textarea
              aria-label="Notlar"
              value={fields.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Notlar"
              maxLength={2000}
              rows={3}
              className="rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
            />
          </Group>

          <Group>
            <Row label="Tarih">
              {fields.hasDate ? (
                <Input
                  aria-label="Tarih"
                  type="date"
                  value={fields.date}
                  onChange={(e) => set({ date: e.target.value })}
                  className="h-8 w-auto"
                />
              ) : null}
              <Switch
                aria-label="Tarih ekle"
                checked={fields.hasDate}
                onCheckedChange={(checked) => set({ hasDate: checked })}
              />
            </Row>
            <Row label="Saat">
              {fields.hasDate && fields.hasTime ? (
                <Input
                  aria-label="Saat"
                  type="time"
                  value={fields.time}
                  onChange={(e) => set({ time: e.target.value })}
                  className="h-8 w-auto"
                />
              ) : null}
              <Switch
                aria-label="Saat ekle"
                checked={fields.hasDate && fields.hasTime}
                disabled={!fields.hasDate}
                onCheckedChange={(checked) => set({ hasTime: checked })}
              />
            </Row>
            <Row label="Tekrar">
              {repeats ? (
                <Input
                  aria-label="Kaç birimde bir"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  value={fields.repeatEvery}
                  onChange={(e) => set({ repeatEvery: e.target.value })}
                  className="h-8 w-16"
                />
              ) : null}
              <Select
                value={fields.hasDate ? fields.repeat : "none"}
                disabled={!fields.hasDate}
                onValueChange={(v) => {
                  if (typeof v === "string") set({ repeat: v as RepeatChoice });
                }}
                items={REPEAT_CHOICE_LABELS}
              >
                <SelectTrigger aria-label="Tekrar" size="sm" className="min-w-28">
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
            </Row>
          </Group>
          {repeats && repeatValid && fields.repeat !== "none" ? (
            <p className="-mt-1 px-3 text-xs text-muted-foreground">
              {describeRepeatRule({ unit: fields.repeat, every: repeatEvery })}. Tamamlayınca bir
              sonraki otomatik eklenir.
            </p>
          ) : null}

          <Group>
            <Row label="Bayrak">
              <Switch
                aria-label="Bayraklı"
                checked={fields.flagged}
                onCheckedChange={(checked) => set({ flagged: checked })}
              />
            </Row>
            <Row label="Öncelik">
              <Select
                value={String(fields.priority)}
                onValueChange={(v) => {
                  const priority = REMINDER_PRIORITIES.find((p) => String(p) === v);
                  if (priority !== undefined) set({ priority });
                }}
                items={PRIORITY_LABELS}
              >
                <SelectTrigger aria-label="Öncelik" size="sm" className="min-w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={String(priority)}>
                      {REMINDER_PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Liste">
              <Select
                value={fields.listId}
                onValueChange={(v) => {
                  if (typeof v === "string") set({ listId: v });
                }}
                items={listLabels}
              >
                <SelectTrigger aria-label="Liste" size="sm" className="min-w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: ACCENT_COLOR_HEX[list.color] }}
                      />
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          </Group>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant={confirmingDelete ? "destructive" : "ghost"}
            onClick={remove}
            disabled={saving}
            className="gap-1.5"
          >
            <Trash2 className="size-3.5" />
            {confirmingDelete ? "Evet, sil" : "Sil"}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose render={<Button variant="outline" disabled={saving} />}>İptal</DialogClose>
            <Button type="button" onClick={submit} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Bitti
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
