/**
 * /ajanda URLs. The week and the category filter are both plain search
 * params, so every view is a shareable, bookmarkable link and the page stays
 * a Server Component.
 */
import type { AgendaCategory } from "@/features/agenda/domain/agenda-task";

export const AJANDA_PATH = "/ajanda";

export function agendaHref(params: {
  /** Monday of the week to show; omitted = current week. */
  week?: string | null | undefined;
  category?: AgendaCategory | null | undefined;
}): string {
  const search = new URLSearchParams();
  if (params.week) search.set("hafta", params.week);
  if (params.category) search.set("kategori", params.category);
  const qs = search.toString();
  return qs ? `${AJANDA_PATH}?${qs}` : AJANDA_PATH;
}
