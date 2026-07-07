-- Enable Realtime (postgres_changes) on the boards table so kanban card edits
-- propagate live to other viewers (see KanbanItem's subscription). Idempotent —
-- safe to re-run. RLS still applies to realtime, so a subscriber only receives
-- board rows they're allowed to SELECT (server members / owners).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'boards'
  ) then
    alter publication supabase_realtime add table public.boards;
  end if;
end $$;
