-- forethought.chat — chat history schema
--
-- One row per chat session. transcript holds the full ChatTurn[] from
-- the client (user + assistant turns including their sources). Mentions
-- are stored as ArticleMention[] alongside, even though the client only
-- carries them per-turn — keeping them at the row level lets us replay
-- a session and reseed the agent the same way later.
--
-- We rely on a service-role server proxy for all access; RLS is enabled
-- with a deny-all policy so direct anon-key clients can never reach the
-- table even if a key leaks.

create extension if not exists pgcrypto;

create table if not exists public.chats (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  title       text,
  transcript  jsonb not null default '[]'::jsonb,
  mentions    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists chats_user_id_updated_at_idx
  on public.chats (user_id, updated_at desc);

alter table public.chats enable row level security;

drop policy if exists "deny all direct access" on public.chats;
create policy "deny all direct access" on public.chats
  for all using (false);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chats_touch_updated_at on public.chats;
create trigger chats_touch_updated_at
  before update on public.chats
  for each row execute function public.touch_updated_at();
