"use client";

/**
 * Create / edit dialog for a calendar event, laid out as Apple Calendar's
 * grouped event sheet. Edit mode also carries the delete button — for a
 * repeating event the confirm step asks whether to delete just this
 * occurrence or the whole series.
 */
import { Loader2, Trash2 } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createEventAction,
  deleteEventAction,
  deleteEventOccurrenceAction,
  updateEventAction,
} from "@/features/calendar/application/calendar-event-actions";
import { eventFormValues } from "@/features/calendar/domain/calendar.schema";
import { longDay } from "@/features/calendar/ui/calendar-format";
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

import type { Calendar, EventOccurrence } from "@/features/calendar/domain/calendar";

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

/** What the dialog is opened for. */
export type EventDialogTarget =
  | {
      readonly mode: "create";
      readonly date: string;
      /** HH:mm to start at; absent = an all-day event. */
      readonly time?: string | undefined;
    }
  | { readonly mode: "edit"; readonly occurrence: EventOccurrence };

interface FieldsState {
  title: string;
  location: string;
  notes: string;
  calendarId: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  repeat: RepeatChoice;
  repeatEvery: string;
  repeatUntil: string;
}

function addMinutes(hhmm: string, minutes: number): { time: string; nextDay: boolean } {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  const wrapped = total % 1440;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { time: `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`, nextDay: total >= 1440 };
}

function initialFields(target: EventDialogTarget, defaultCalendarId: string): FieldsState {
  if (target.mode === "edit") {
    const o = target.occurrence;
    const values = eventFormValues({
      calendar_id: o.calendar_id,
      title: o.title,
      notes: o.notes,
      location: o.location,
      all_day: o.all_day,
      starts_at: o.series_starts_at,
      ends_at: o.series_ends_at,
      repeat: o.repeat,
      repeat_until: o.repeat_until,
    });
    return {
      title: values.title,
      location: values.location ?? "",
      notes: values.notes ?? "",
      calendarId: values.calendar_id,
      allDay: values.all_day,
      startDate: values.start_date,
      startTime: values.start_time ?? "09:00",
      endDate: values.end_date ?? values.start_date,
      endTime: values.end_time ?? "10:00",
      repeat: values.repeat_unit ?? "none",
      repeatEvery: String(values.repeat_every ?? 1),
      repeatUntil: values.repeat_until ?? "",
    };
  }
  const startTime = target.time ?? "09:00";
  const end = addMinutes(startTime, 60);
  return {
    title: "",
    location: "",
    notes: "",
    calendarId: defaultCalendarId,
    allDay: target.time === undefined,
    startDate: target.date,
    startTime,
    // An event starting at 23:30 ends just before midnight rather than
    // silently spilling into the next day.
    endDate: target.date,
    endTime: end.nextDay ? "23:59" : end.time,
    repeat: "none",
    repeatEvery: "1",
    repeatUntil: "",
  };
}

function Group({ children }: { children: ReactNode }) {
  return <div className="divide-y overflow-hidden rounded-xl bg-muted/60">{children}</div>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
      <span className="text-sm">{label}</span>
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}

const PLAIN_INPUT =
  "rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0" as const;

export function EventDialog({
  target,
  calendars,
  onClose,
}: {
  /** Null = closed. */
  target: EventDialogTarget | null;
  calendars: readonly Calendar[];
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {target !== null ? (
        // Keyed so every opening starts from that target's own values.
        <EventDialogBody
          key={target.mode === "edit" ? target.occurrence.key : `new:${target.date}:${target.time}`}
          target={target}
          calendars={calendars}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function EventDialogBody({
  target,
  calendars,
  onClose,
}: {
  target: EventDialogTarget;
  calendars: readonly Calendar[];
  onClose: () => void;
}) {
  const [fields, setFields] = useState<FieldsState>(() =>
    initialFields(target, calendars[0]?.id ?? ""),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, startSaving] = useTransition();

  const set = (patch: Partial<FieldsState>) => setFields((prev) => ({ ...prev, ...patch }));

  const isCreate = target.mode === "create";
  const occurrence = target.mode === "edit" ? target.occurrence : null;
  const isSeries = occurrence !== null && occurrence.repeat !== null;

  const repeatEvery = Number.parseInt(fields.repeatEvery, 10);
  const repeatValid = Number.isInteger(repeatEvery) && repeatEvery >= 1 && repeatEvery <= 365;
  const repeats = fields.repeat !== "none";
  const calendarLabels = Object.fromEntries(calendars.map((c) => [c.id, c.name]));

  // Moving the start drags the end along, keeping the event's length in days.
  const setStartDate = (startDate: string) => {
    set({ startDate, endDate: fields.endDate < startDate ? startDate : fields.endDate });
  };

  const done = (message: string) => {
    toast.success(message);
    onClose();
  };

  const submit = () => {
    if (fields.title.trim() === "") {
      toast.error("Başlık gerekli.");
      return;
    }
    if (fields.calendarId === "") {
      toast.error("Önce bir takvim ekleyin.");
      return;
    }
    if (repeats && !repeatValid) {
      toast.error("Tekrar aralığı 1 ile 365 arasında bir tam sayı olmalı.");
      return;
    }
    const payload = {
      calendar_id: fields.calendarId,
      title: fields.title,
      location: fields.location,
      notes: fields.notes,
      all_day: fields.allDay,
      start_date: fields.startDate,
      start_time: fields.allDay ? null : fields.startTime,
      end_date: fields.endDate,
      end_time: fields.allDay ? null : fields.endTime,
      repeat_unit: repeats ? fields.repeat : null,
      repeat_every: repeats ? repeatEvery : null,
      repeat_until: repeats ? fields.repeatUntil : null,
    };
    startSaving(async () => {
      const result =
        occurrence === null
          ? await createEventAction(payload)
          : await updateEventAction({ ...payload, id: occurrence.event_id });
      if (result.ok) done(isCreate ? "Etkinlik eklendi." : "Etkinlik güncellendi.");
      else toast.error(result.error.message);
    });
  };

  const removeAll = () => {
    if (occurrence === null) return;
    startSaving(async () => {
      const result = await deleteEventAction({ id: occurrence.event_id });
      if (result.ok) done(isSeries ? "Etkinliğin tüm tekrarları silindi." : "Etkinlik silindi.");
      else toast.error(result.error.message);
    });
  };

  const removeThisOne = () => {
    if (occurrence === null) return;
    startSaving(async () => {
      const result = await deleteEventOccurrenceAction({
        id: occurrence.event_id,
        occurrence_date: occurrence.occurrence_date,
      });
      if (result.ok) done("Etkinlik silindi.");
      else toast.error(result.error.message);
    });
  };

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isCreate ? "Yeni Etkinlik" : "Etkinlik"}</DialogTitle>
        {isSeries && occurrence ? (
          <DialogDescription>
            {confirmingDelete
              ? `Yalnızca ${longDay(occurrence.occurrence_date)} günündeki etkinlik mi, yoksa tüm tekrarları mı silinsin?`
              : "Tekrarlayan etkinlik — değişiklikler tüm tekrarlara uygulanır."}
          </DialogDescription>
        ) : null}
      </DialogHeader>

      <div className="grid gap-3">
        <Group>
          <Input
            aria-label="Başlık"
            value={fields.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Başlık"
            maxLength={200}
            autoFocus={isCreate}
            className={`${PLAIN_INPUT} h-11 text-[0.95rem] font-medium`}
          />
          <Input
            aria-label="Konum"
            value={fields.location}
            onChange={(e) => set({ location: e.target.value })}
            placeholder="Konum"
            maxLength={200}
            className={`${PLAIN_INPUT} h-11`}
          />
        </Group>

        <Group>
          <Row label="Tüm gün">
            <Switch
              aria-label="Tüm gün"
              checked={fields.allDay}
              onCheckedChange={(checked) => set({ allDay: checked })}
            />
          </Row>
          <Row label="Başlangıç">
            <Input
              aria-label="Başlangıç tarihi"
              type="date"
              value={fields.startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 w-auto"
            />
            {!fields.allDay ? (
              <Input
                aria-label="Başlangıç saati"
                type="time"
                value={fields.startTime}
                onChange={(e) => set({ startTime: e.target.value })}
                className="h-8 w-auto"
              />
            ) : null}
          </Row>
          <Row label="Bitiş">
            <Input
              aria-label="Bitiş tarihi"
              type="date"
              min={fields.startDate}
              value={fields.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
              className="h-8 w-auto"
            />
            {!fields.allDay ? (
              <Input
                aria-label="Bitiş saati"
                type="time"
                value={fields.endTime}
                onChange={(e) => set({ endTime: e.target.value })}
                className="h-8 w-auto"
              />
            ) : null}
          </Row>
        </Group>

        <Group>
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
              value={fields.repeat}
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
          {repeats ? (
            <Row label="Tekrar bitişi">
              {fields.repeatUntil !== "" ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => set({ repeatUntil: "" })}
                >
                  Süresiz yap
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">Süresiz</span>
              )}
              <Input
                aria-label="Tekrar bitiş tarihi"
                type="date"
                min={fields.startDate}
                value={fields.repeatUntil}
                onChange={(e) => set({ repeatUntil: e.target.value })}
                className="h-8 w-auto"
              />
            </Row>
          ) : null}
        </Group>
        {repeats && repeatValid && fields.repeat !== "none" ? (
          <p className="-mt-1 px-3 text-xs text-muted-foreground">
            {describeRepeatRule({ unit: fields.repeat, every: repeatEvery })}
            {fields.repeatUntil !== "" ? `, ${longDay(fields.repeatUntil)} gününe kadar` : ""}.
          </p>
        ) : null}

        <Group>
          <Row label="Takvim">
            <Select
              value={fields.calendarId}
              onValueChange={(v) => {
                if (typeof v === "string") set({ calendarId: v });
              }}
              items={calendarLabels}
            >
              <SelectTrigger aria-label="Takvim" size="sm" className="min-w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((calendar) => (
                  <SelectItem key={calendar.id} value={calendar.id}>
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: ACCENT_COLOR_HEX[calendar.color] }}
                    />
                    {calendar.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Group>

        <Group>
          <Textarea
            aria-label="Notlar"
            value={fields.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Notlar"
            maxLength={2000}
            rows={3}
            className={PLAIN_INPUT}
          />
        </Group>
      </div>

      {confirmingDelete && occurrence ? (
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => setConfirmingDelete(false)}>
            Vazgeç
          </Button>
          {isSeries ? (
            <Button type="button" variant="destructive" disabled={saving} onClick={removeThisOne}>
              Yalnızca bu etkinlik
            </Button>
          ) : null}
          <Button type="button" variant="destructive" disabled={saving} onClick={removeAll} className="gap-1.5">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {isSeries ? "Tüm tekrarlar" : "Evet, sil"}
          </Button>
        </DialogFooter>
      ) : (
        <DialogFooter className={isCreate ? undefined : "sm:justify-between"}>
          {!isCreate ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving}
              className="gap-1.5"
            >
              <Trash2 className="size-3.5" />
              Sil
            </Button>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose render={<Button variant="outline" disabled={saving} />}>İptal</DialogClose>
            <Button type="button" onClick={submit} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {isCreate ? "Ekle" : "Kaydet"}
            </Button>
          </div>
        </DialogFooter>
      )}
    </DialogContent>
  );
}
