/** Agenda (yapılacaklar) write tools — thin adapters over the agenda Server Actions. */
import "server-only";

import {
  completeAgendaTaskInput,
  createAgendaTaskInput,
  deleteAgendaTaskInput,
  updateAgendaTaskInput,
} from "@/features/mcp/domain/mcp-write-inputs";
import {
  createAgendaTaskAction,
  deleteAgendaTaskAction,
  setAgendaTaskCompletedAction,
  updateAgendaTaskAction,
} from "@/features/agenda/application/agenda-task-actions";

import { DESTRUCTIVE, WRITE } from "./annotations";
import { toolError, toolFromResult } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerAgendaWriteTools(server: McpServer): void {
  server.registerTool(
    "create_agenda_task",
    {
      title: "Yapılacak ekle",
      description:
        "Ajandaya iş/yapılacak ekler. due_date boşsa tarihsiz (backlog) olur; tekrar için repeat_unit ve repeat_every birlikte, due_date ile verilmeli.",
      inputSchema: createAgendaTaskInput,
      annotations: { ...WRITE, title: "Yapılacak ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("create_agenda_task", await createAgendaTaskAction(input));
      } catch (cause) {
        return toolError("create_agenda_task", cause);
      }
    },
  );

  server.registerTool(
    "update_agenda_task",
    {
      title: "Yapılacağı düzenle",
      description:
        "Bir ajanda işini günceller. Tüm alanlar yeniden yazılır (boş bırakılan not/tarih/tekrar temizlenir): önce get_agenda ile mevcut işi oku, değişmeyenleri aynen gönder.",
      inputSchema: updateAgendaTaskInput,
      annotations: { ...WRITE, title: "Yapılacağı düzenle" },
    },
    async (input) => {
      try {
        return toolFromResult("update_agenda_task", await updateAgendaTaskAction(input), {
          taskId: input.id,
        });
      } catch (cause) {
        return toolError("update_agenda_task", cause, { taskId: input.id });
      }
    },
  );

  server.registerTool(
    "complete_agenda_task",
    {
      title: "Yapılacağı tamamla / yeniden aç",
      description:
        "Ajanda işini tamamlandı yapar veya yeniden açar. Tekrarlayan işte sıradaki tekrar otomatik oluşturulur.",
      inputSchema: completeAgendaTaskInput,
      annotations: { ...WRITE, title: "Yapılacağı tamamla / yeniden aç" },
    },
    async (input) => {
      try {
        return toolFromResult("complete_agenda_task", await setAgendaTaskCompletedAction(input), {
          taskId: input.id,
        });
      } catch (cause) {
        return toolError("complete_agenda_task", cause, { taskId: input.id });
      }
    },
  );

  server.registerTool(
    "delete_agenda_task",
    {
      title: "Yapılacağı sil",
      description: "Ajanda işini KALICI olarak siler. Geri alınamaz.",
      inputSchema: deleteAgendaTaskInput,
      annotations: { ...DESTRUCTIVE, title: "Yapılacağı sil" },
    },
    async ({ id }) => {
      try {
        return toolFromResult("delete_agenda_task", await deleteAgendaTaskAction({ id }), {
          taskId: id,
        });
      } catch (cause) {
        return toolError("delete_agenda_task", cause, { taskId: id });
      }
    },
  );
}
