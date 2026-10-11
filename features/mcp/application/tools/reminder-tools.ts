/** Anımsatıcılar (/animsaticilar) tools — thin adapters over the reminders application layer. */
import "server-only";

import { remindersInput } from "@/features/mcp/domain/mcp-tool-inputs";
import {
  completeReminderInput,
  createReminderInput,
  deleteReminderInput,
  updateReminderInput,
} from "@/features/mcp/domain/mcp-write-inputs";
import { getRemindersPage } from "@/features/reminders/application/get-reminders-page";
import {
  createReminderAction,
  deleteReminderAction,
  setReminderCompletedAction,
  updateReminderAction,
} from "@/features/reminders/application/reminder-actions";

import { DESTRUCTIVE, READ_ONLY, WRITE } from "./annotations";
import { toolError, toolFromResult } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerReminderTools(server: McpServer): void {
  server.registerTool(
    "get_reminders",
    {
      title: "Anımsatıcılar",
      description:
        "Anımsatıcı listelerini (lists), açık anımsatıcı sayılarını (counts) ve seçilen listenin anımsatıcılarını getirir. Saatler ISO biçimindedir; due_all_day=true ise yalnızca gün anlamlıdır.",
      inputSchema: remindersInput,
      annotations: { ...READ_ONLY, title: "Anımsatıcılar" },
    },
    async (input) => {
      try {
        return toolFromResult("get_reminders", await getRemindersPage(input));
      } catch (cause) {
        return toolError("get_reminders", cause);
      }
    },
  );

  server.registerTool(
    "create_reminder",
    {
      title: "Anımsatıcı ekle",
      description:
        "Bir listeye anımsatıcı ekler. due_date boşsa tarihsiz olur; due_time verilirse o saatte, verilmezse tüm gün. Tekrar için repeat_unit, due_date ile birlikte verilmeli.",
      inputSchema: createReminderInput,
      annotations: { ...WRITE, title: "Anımsatıcı ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("create_reminder", await createReminderAction(input));
      } catch (cause) {
        return toolError("create_reminder", cause);
      }
    },
  );

  server.registerTool(
    "update_reminder",
    {
      title: "Anımsatıcıyı düzenle",
      description:
        "Bir anımsatıcıyı günceller. Yalnızca gönderilen alanlar değişir; null gönderilen not/tarih/saat/tekrar temizlenir.",
      inputSchema: updateReminderInput,
      annotations: { ...WRITE, title: "Anımsatıcıyı düzenle" },
    },
    async (input) => {
      try {
        return toolFromResult("update_reminder", await updateReminderAction(input), {
          reminderId: input.id,
        });
      } catch (cause) {
        return toolError("update_reminder", cause, { reminderId: input.id });
      }
    },
  );

  server.registerTool(
    "complete_reminder",
    {
      title: "Anımsatıcıyı tamamla / yeniden aç",
      description:
        "Anımsatıcıyı tamamlandı yapar veya yeniden açar. Tekrarlayan anımsatıcıda sıradaki tekrar otomatik oluşturulur (next_due_at).",
      inputSchema: completeReminderInput,
      annotations: { ...WRITE, title: "Anımsatıcıyı tamamla / yeniden aç" },
    },
    async (input) => {
      try {
        return toolFromResult("complete_reminder", await setReminderCompletedAction(input), {
          reminderId: input.id,
        });
      } catch (cause) {
        return toolError("complete_reminder", cause, { reminderId: input.id });
      }
    },
  );

  server.registerTool(
    "delete_reminder",
    {
      title: "Anımsatıcıyı sil",
      description: "Anımsatıcıyı KALICI olarak siler. Geri alınamaz.",
      inputSchema: deleteReminderInput,
      annotations: { ...DESTRUCTIVE, title: "Anımsatıcıyı sil" },
    },
    async ({ id }) => {
      try {
        return toolFromResult("delete_reminder", await deleteReminderAction({ id }), {
          reminderId: id,
        });
      } catch (cause) {
        return toolError("delete_reminder", cause, { reminderId: id });
      }
    },
  );
}
