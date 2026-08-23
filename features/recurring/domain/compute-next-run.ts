/**
 * Thin adapter over shared/utils/recurrence.ts for this feature's cadence
 * vocabulary (weekly | biweekly | monthly). The actual date math (day-of-week
 * self-correction, month-end clamping, RUN_HOUR anchoring) lives in the
 * shared module so features/finance's recurring-expense templates can reuse
 * it for quarterly/6-monthly/yearly cadences without duplicating the logic.
 *
 * This file's exported signatures are unchanged from before the extraction —
 * every existing caller (features/recurring/**) is unaffected.
 */
import {
  computeNextRunAt as computeNextRunAtGeneric,
  firstRunOnOrAfter as firstRunOnOrAfterGeneric,
  RUN_HOUR as SHARED_RUN_HOUR,
  type RecurrenceShape,
} from "@/shared/utils/recurrence";

import type { RecurringCadence } from "@/features/recurring/domain/recurring-template";

/** The day-anchor a cadence needs: weekly/biweekly use dayOfWeek, monthly dayOfMonth. */
export interface CadenceShape {
  readonly dayOfWeek?: number | null;
  readonly dayOfMonth?: number | null;
}

/** Generation hour in Istanbul wall-clock (06:00). */
export const RUN_HOUR = SHARED_RUN_HOUR;

function toGenericShape(cadence: RecurringCadence, shape: CadenceShape): RecurrenceShape {
  return {
    dayOfWeek: shape.dayOfWeek ?? null,
    dayOfMonth: shape.dayOfMonth ?? null,
    intervalWeeks: cadence === "biweekly" ? 2 : 1,
    intervalMonths: 1,
  };
}

/**
 * First occurrence on OR AFTER `startYmd` (a YYYY-MM-DD Istanbul day), as the
 * UTC run instant. Used when a template is created.
 */
export function firstRunOnOrAfter(
  startYmd: string,
  cadence: RecurringCadence,
  shape: CadenceShape,
): Date {
  return firstRunOnOrAfterGeneric(
    startYmd,
    cadence === "monthly" ? "monthly" : "weekly",
    toGenericShape(cadence, shape),
  );
}

/**
 * Next run STRICTLY AFTER `from`. `from` is expected to be a prior occurrence
 * (the template's current next_run_at); the generator calls this to advance.
 */
export function computeNextRunAt(
  cadence: RecurringCadence,
  shape: CadenceShape,
  from: Date,
): Date {
  return computeNextRunAtGeneric(
    cadence === "monthly" ? "monthly" : "weekly",
    toGenericShape(cadence, shape),
    from,
  );
}
