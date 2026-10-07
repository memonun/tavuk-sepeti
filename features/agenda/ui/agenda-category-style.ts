/**
 * One color per agenda category, so the week reads at a glance (red = animal
 * health, amber = coop upkeep, ...). Light and dark variants side by side.
 */
import type { AgendaCategory } from "@/features/agenda/domain/agenda-task";

export const AGENDA_CATEGORY_DOT: Readonly<Record<AgendaCategory, string>> = {
  genel: "bg-slate-400 dark:bg-slate-500",
  hayvan_sagligi: "bg-rose-500 dark:bg-rose-400",
  kumes_bakimi: "bg-amber-500 dark:bg-amber-400",
  satis_teslimat: "bg-sky-500 dark:bg-sky-400",
  alisveris: "bg-emerald-500 dark:bg-emerald-400",
};

export const AGENDA_CATEGORY_BADGE: Readonly<Record<AgendaCategory, string>> = {
  genel: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  hayvan_sagligi: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  kumes_bakimi: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  satis_teslimat: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  alisveris: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};
