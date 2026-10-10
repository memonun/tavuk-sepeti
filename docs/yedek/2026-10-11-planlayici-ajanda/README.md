# Yedek — Planlayıcı ve Ajanda (2026-10-11)

Bu iki sayfa Apple Takvim / Anımsatıcılar benzeri yeni sayfalarla değiştirilmeden
önce alınan yedek.

## Veri

`yedek.json` — canlı veritabanındaki `planner_tasks` ve `agenda_tasks`
tablolarının tam dökümü ve Ajanda kategorileri.

Yedek anında **iki tablo da boştu** (0 satır). Ajanda kategorileri veritabanında
değil kodda tanımlı; etiket ve renkleriyle birlikte `yedek.json` içinde.

## Kod

Eski sayfaların kodu `yedek/planlayici-ajanda-2026-10-11` git etiketinde
(commit `7c24cd5`). Kapsam:

- `app/(admin)/planlayici/`, `features/planner/`
- `app/(admin)/ajanda/`, `features/agenda/`
- `features/mcp/application/tools/planner-tools.ts`, `agenda-write-tools.ts`
- `supabase/migrations/20261007120000_planner_tasks.sql`
- `supabase/migrations/20261007130000_agenda_tasks.sql`

Eski bir dosyaya bakmak için:

```bash
git show yedek/planlayici-ajanda-2026-10-11:features/agenda/domain/agenda-task.ts
```
