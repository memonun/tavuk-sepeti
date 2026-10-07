/**
 * DB row ↔ PlannerTask domain entity mapping. The only place in the
 * codebase that knows about the raw row shape for `planner_tasks`.
 *
 * `planner_tasks` post-dates the generated `Database` type (see
 * task.repository.ts), so the row is typed structurally here rather than
 * via `Database["public"]["Tables"][...]`.
 */
import type { PlannerTask, PlannerTaskStatus } from "@/features/planner/domain/task";

export interface PlannerTaskRow {
  id: string;
  owner_id: string;
  title: string;
  notes: string | null;
  scheduled_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function rowToPlannerTask(row: PlannerTaskRow): PlannerTask {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    notes: row.notes,
    scheduledDate: row.scheduled_date,
    // The CHECK constraint guarantees 'open' | 'done' in the DB; this is
    // just the TS-side narrowing of what's already a closed set.
    status: row.status as PlannerTaskStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
