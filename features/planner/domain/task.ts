/**
 * Personal weekly planner — owner's own to-do list (not customer- or
 * order-facing; see migration 20261007120000). RLS scopes every row to
 * its owner, same model as the saved-views feature.
 */

export type PlannerTaskStatus = "open" | "done";

export interface PlannerTask {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly notes: string | null;
  /** YYYY-MM-DD (Istanbul calendar day), or null = backlog/unscheduled. */
  readonly scheduledDate: string | null;
  readonly status: PlannerTaskStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
