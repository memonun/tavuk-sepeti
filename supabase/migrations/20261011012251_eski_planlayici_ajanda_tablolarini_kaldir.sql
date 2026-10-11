-- eski_planlayici_ajanda_tablolarini_kaldir
--
-- Removes the two tables of the old Planlayıcı and Ajanda pages. Both pages were
-- replaced by Takvim and Anımsatıcılar in 20261010221830 (PR #204), which
-- deliberately left these tables in place for its own deploy window (CLAUDE.md
-- §7: remove in a later PR, once no running code reads them). That code is live
-- now and nothing references either table: no foreign key points at them, no
-- view or function mentions them, and neither is in the realtime publication.
--
-- Both tables were EMPTY in production when this was written (planner_tasks was
-- never written to; agenda_tasks' six test rows were deleted on 2026-10-07), and
-- their definitions stay in the migration history (20261007120000,
-- 20261007130000) and under docs/yedek/2026-10-11-planlayici-ajanda.
--
-- Dropping a table takes its indexes, RLS policies and updated_at trigger with
-- it. The shared set_updated_at() function stays — other tables use it.

drop table planner_tasks;
drop table agenda_tasks;
