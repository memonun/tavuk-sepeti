"use client";

/**
 * Keeps the bell honest about reminders while the admin panel is open. There
 * is no cron in this project, so the panel itself asks the server to raise
 * the notifications that have come due: once on load, then again exactly when
 * the next reminder falls due. The bell picks the new rows up through its own
 * realtime subscription; this component renders nothing.
 */
import { useEffect } from "react";

import { checkDueRemindersAction } from "@/features/reminders/application/due-reminder-notifications";

/** Re-check at least this often — covers reminders added from another device
 *  (or through the Claude connector) after the last check. */
const SAFETY_INTERVAL_MS = 5 * 60_000;

/** Small cushion so the check lands just after the reminder's moment. */
const AFTER_DUE_MS = 1_000;

export function ReminderDueTicker() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    };

    const run = async () => {
      let delay = SAFETY_INTERVAL_MS;
      try {
        const result = await checkDueRemindersAction();
        if (result.ok && result.value.nextDueAt !== null) {
          const untilDue = new Date(result.value.nextDueAt).getTime() - Date.now() + AFTER_DUE_MS;
          delay = Math.min(SAFETY_INTERVAL_MS, Math.max(AFTER_DUE_MS, untilDue));
        }
      } catch {
        // Offline or mid-deploy: simply try again on the safety interval.
      }
      if (!cancelled) schedule(delay);
    };

    // A backgrounded tab throttles timers; catch up the moment it is looked at.
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(0);
    };

    schedule(0);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
