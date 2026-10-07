/**
 * Planner tasks (/planlayici). They belong to the signed-in admin, so the token
 * identity decides whose list this is — the same as the panel.
 */
import "server-only";

import { createPlannerTaskAction } from "@/features/planner/application/create-planner-task";
import { deletePlannerTaskAction } from "@/features/planner/application/delete-planner-task";
import { listPlannerWeekTasks } from "@/features/planner/application/list-planner-tasks";
import { updatePlannerTaskAction } from "@/features/planner/application/update-planner-task";
import {
  createPlannerTaskInput,
  deletePlannerTaskInput,
  listPlannerTasksInput,
  updatePlannerTaskInput,
} from "@/features/mcp/domain/mcp-write-inputs";

import { DESTRUCTIVE, READ_ONLY, WRITE } from "./annotations";
import { toolError, toolFromResult } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPlannerTools(server: McpServer): void {
  server.registerTool(
    "list_planner_tasks",
    {
      title: "Planlayıcı görevleri",
      description:
        "Bağlı yöneticinin planlayıcı görevlerini getirir: verilen haftanın (pazartesi başlangıçlı) tarihli görevleri ve tarihsiz (backlog) görevleri. Ajanda (get_agenda) ayrı bir listedir.",
      inputSchema: listPlannerTasksInput,
      annotations: { ...READ_ONLY, title: "Planlayıcı görevleri" },
    },
    async ({ week_start }) => {
      try {
        return toolFromResult("list_planner_tasks", await listPlannerWeekTasks(week_start));
      } catch (cause) {
        return toolError("list_planner_tasks", cause);
      }
    },
  );

  server.registerTool(
    "create_planner_task",
    {
      title: "Planlayıcıya görev ekle",
      description: "Planlayıcıya görev ekler. scheduled_date boşsa tarihsiz (backlog) olur.",
      inputSchema: createPlannerTaskInput,
      annotations: { ...WRITE, title: "Planlayıcıya görev ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("create_planner_task", await createPlannerTaskAction(input));
      } catch (cause) {
        return toolError("create_planner_task", cause);
      }
    },
  );

  server.registerTool(
    "update_planner_task",
    {
      title: "Planlayıcı görevini düzenle",
      description:
        "Görevin başlığını, notunu, tarihini veya durumunu (open/done) günceller. Sadece gönderdiğin alanlar değişir; not/tarihi temizlemek için null veya boş gönder.",
      inputSchema: updatePlannerTaskInput,
      annotations: { ...WRITE, title: "Planlayıcı görevini düzenle" },
    },
    async (input) => {
      try {
        // The action patches only the keys that are PRESENT, so forward exactly
        // what the model sent — an absent key must stay absent.
        const patch: Record<string, unknown> = { id: input.id };
        if (input.title !== undefined) patch.title = input.title;
        if (input.notes !== undefined) patch.notes = input.notes;
        if (input.scheduled_date !== undefined) patch.scheduled_date = input.scheduled_date;
        if (input.status !== undefined) patch.status = input.status;
        return toolFromResult("update_planner_task", await updatePlannerTaskAction(patch), { taskId: input.id });
      } catch (cause) {
        return toolError("update_planner_task", cause, { taskId: input.id });
      }
    },
  );

  server.registerTool(
    "delete_planner_task",
    {
      title: "Planlayıcı görevini sil",
      description: "Planlayıcı görevini KALICI olarak siler. Geri alınamaz.",
      inputSchema: deletePlannerTaskInput,
      annotations: { ...DESTRUCTIVE, title: "Planlayıcı görevini sil" },
    },
    async ({ id }) => {
      try {
        return toolFromResult("delete_planner_task", await deletePlannerTaskAction(id), { taskId: id });
      } catch (cause) {
        return toolError("delete_planner_task", cause, { taskId: id });
      }
    },
  );
}
