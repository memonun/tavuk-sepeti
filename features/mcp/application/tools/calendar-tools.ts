/** Takvim (/takvim) tools — thin adapters over the calendar application layer. */
import "server-only";

import {
  createEventAction,
  deleteEventAction,
  deleteEventOccurrenceAction,
  updateEventAction,
} from "@/features/calendar/application/calendar-event-actions";
import { getCalendarForDays } from "@/features/calendar/application/get-calendar-range";
import { calendarInput } from "@/features/mcp/domain/mcp-tool-inputs";
import {
  createCalendarEventInput,
  deleteCalendarEventInput,
  updateCalendarEventInput,
} from "@/features/mcp/domain/mcp-write-inputs";

import { DESTRUCTIVE, READ_ONLY, WRITE } from "./annotations";
import { toolError, toolFromResult } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerCalendarTools(server: McpServer): void {
  server.registerTool(
    "get_calendar",
    {
      title: "Takvim",
      description:
        "Verilen gün aralığındaki takvimi getirir: takvimler (calendars), etkinlikler (occurrences — tekrarlayanların her tekrarı ayrı satır), o günlere tarihli anımsatıcılar (reminders) ve gün gün teslimat sayıları (deliveries). Saatler ISO biçimindedir; all_day=true etkinlikte ends_at son günden sonraki gece yarısıdır. Tekrarlayan etkinlikte repeat doludur ve series_starts_at / series_ends_at serinin İLK tekrarıdır.",
      inputSchema: calendarInput,
      annotations: { ...READ_ONLY, title: "Takvim" },
    },
    async (input) => {
      try {
        return toolFromResult("get_calendar", await getCalendarForDays(input));
      } catch (cause) {
        return toolError("get_calendar", cause);
      }
    },
  );

  server.registerTool(
    "create_calendar_event",
    {
      title: "Takvime etkinlik ekle",
      description:
        "Takvime etkinlik ekler. Saatli etkinlikte start_time zorunludur; tüm gün için all_day=true. Tekrar için repeat_unit verilir.",
      inputSchema: createCalendarEventInput,
      annotations: { ...WRITE, title: "Takvime etkinlik ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("create_calendar_event", await createEventAction(input));
      } catch (cause) {
        return toolError("create_calendar_event", cause);
      }
    },
  );

  server.registerTool(
    "update_calendar_event",
    {
      title: "Etkinliği düzenle",
      description:
        "Bir etkinliği günceller. Tüm alanlar yeniden yazılır (boş bırakılan not/konum/tekrar temizlenir): önce get_calendar ile mevcut etkinliği oku, değişmeyenleri aynen gönder. Tekrarlayan etkinlikte tüm seri değişir: start/end alanlarına tek bir tekrarın değil serinin başlangıcını (series_starts_at / series_ends_at) yaz.",
      inputSchema: updateCalendarEventInput,
      annotations: { ...WRITE, title: "Etkinliği düzenle" },
    },
    async (input) => {
      try {
        return toolFromResult("update_calendar_event", await updateEventAction(input), {
          eventId: input.id,
        });
      } catch (cause) {
        return toolError("update_calendar_event", cause, { eventId: input.id });
      }
    },
  );

  server.registerTool(
    "delete_calendar_event",
    {
      title: "Etkinliği sil",
      description:
        "Etkinliği KALICI olarak siler. Tekrarlayan etkinlikte occurrence_date verilirse yalnızca o günkü tekrar, verilmezse tüm seri silinir. Geri alınamaz.",
      inputSchema: deleteCalendarEventInput,
      annotations: { ...DESTRUCTIVE, title: "Etkinliği sil" },
    },
    async ({ id, occurrence_date }) => {
      try {
        const result =
          occurrence_date === undefined
            ? await deleteEventAction({ id })
            : await deleteEventOccurrenceAction({ id, occurrence_date });
        return toolFromResult("delete_calendar_event", result, { eventId: id });
      } catch (cause) {
        return toolError("delete_calendar_event", cause, { eventId: id });
      }
    },
  );
}
