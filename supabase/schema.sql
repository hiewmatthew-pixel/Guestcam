-- GlanceCam database schema + security. Safe to re-run: every statement
-- is idempotent, so the same file works for a fresh project AND for
-- upgrading an existing one. Paste the whole file into the Supabase SQL
-- editor and press Run.
--
-- Security model:
--   * The anon key ships in the browser, so anon may only READ approved
--     submissions/comments and look up one event by slug. It cannot write. Every event mutation, all
--     moderation, and the couple's/admin's view of pending rows go through
--     Next.js server actions that use the service-role key after checking
--     the admin cookie or the couple's manage_token.
--   * Gallery reveal time and expiry are enforced HERE (not just in the
--     browser), so the anon key can't list photos early or after expiry.
--   * Guests can't choose `approved`; a trigger copies the event's
--     auto_approve setting onto every new submission.

create extension if not exists pgcrypto;

-- ── tables ──────────────────────────────────────────────────────────────

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  couple_names text not null,
  wedding_date date not null,
  welcome_message text,
  tier text not null default 'signature' check (tier in ('glimpse', 'signature', 'studio')),
  manage_token text not null,
  reveal_at timestamptz,
  auto_approve boolean not null default true,
  created_at timestamptz not null default now()
);
-- upgrades from older installs
alter table public.events add column if not exists tier text not null default 'signature';
alter table public.events add column if not exists manage_token text;
update public.events set manage_token = encode(gen_random_bytes(9), 'base64') where manage_token is null;
alter table public.events alter column manage_token set not null;
alter table public.events add column if not exists reveal_at timestamptz;
alter table public.events add column if not exists auto_approve boolean not null default true;
create index if not exists events_manage_token_idx on public.events(manage_token);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  media_url text not null,
  media_type text not null,
  filter_name text not null,
  guest_name text,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.submissions drop constraint if exists submissions_media_type_check;
alter table public.submissions add constraint submissions_media_type_check
  check (media_type in ('photo', 'video', 'boomerang', 'voice'));
create index if not exists submissions_event_idx on public.submissions(event_id, created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  guest_name text,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists comments_submission_idx on public.comments(submission_id);
create index if not exists comments_event_idx on public.comments(event_id);

alter table public.events enable row level security;
alter table public.submissions enable row level security;
alter table public.comments enable row level security;

-- ── helpers ─────────────────────────────────────────────────────────────

-- Is this event's guest gallery open right now? Mirrors lib/tiers.ts:
-- revealed (reveal_at null or past) and not expired (wedding_date +
-- galleryDays + 1 day; glimpse 7, signature 30, studio 365).
-- SECURITY DEFINER so it can read events columns anon isn't granted.
create or replace function public.event_gallery_open(eid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = eid
      and (e.reveal_at is null or e.reveal_at <= now())
      and now() < e.wedding_date
        + make_interval(days => 1 + case e.tier
            when 'glimpse' then 7
            when 'studio' then 365
            else 30 end)
  );
$$;
revoke all on function public.event_gallery_open(uuid) from public;
grant execute on function public.event_gallery_open(uuid) to anon, authenticated, service_role;

-- Guests can't decide whether their own capture is approved.
create or replace function public.submissions_force_approval()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.approved := coalesce(
    (select e.auto_approve from public.events e where e.id = new.event_id),
    true
  );
  return new;
end;
$$;
revoke execute on function public.submissions_force_approval() from public, anon, authenticated;
drop trigger if exists submissions_force_approval on public.submissions;
create trigger submissions_force_approval
  before insert on public.submissions
  for each row execute function public.submissions_force_approval();

-- ── lock down the public (anon) key ────────────────────────────────────
-- The anon key ships in the browser. It may only READ approved, open
-- submissions and their comments, and look up ONE event by its exact slug.
-- All writes (uploads, captures, comments, moderation, event admin) go
-- through Next.js server actions using the service-role key, which check
-- the event, tier, file type/size and a per-IP rate limit first
-- (app/event/[slug]/actions.ts). Nobody can list the studio's clients.

revoke all on public.events, public.submissions, public.comments from anon, authenticated;
grant select on public.submissions, public.comments to anon, authenticated;

drop policy if exists "events readable by anyone" on public.events;
-- (no events policies: anon has no table privileges on events at all)

-- one event by exact slug, guest-safe columns only (never manage_token)
create or replace function public.get_public_event(p_slug text)
returns table (id uuid, slug text, couple_names text, wedding_date date, welcome_message text,
               tier text, reveal_at timestamptz, auto_approve boolean, created_at timestamptz)
language sql stable security definer set search_path = public
as $fn$
  select e.id, e.slug, e.couple_names, e.wedding_date, e.welcome_message, e.tier,
         e.reveal_at, e.auto_approve, e.created_at
  from public.events e where e.slug = p_slug limit 1;
$fn$;
revoke all on function public.get_public_event(text) from public;
grant execute on function public.get_public_event(text) to anon, authenticated, service_role;

-- ── submissions ────────────────────────────────────────────────────────

drop policy if exists "approved submissions readable by anyone" on public.submissions;
create policy "approved submissions readable by anyone" on public.submissions
  for select using (approved and public.event_gallery_open(event_id));
drop policy if exists "anon can insert submissions" on public.submissions;

-- a stored file can only ever be recorded once (makes finalize retries safe)
create unique index if not exists submissions_media_url_key on public.submissions(media_url);

-- ── comments ───────────────────────────────────────────────────────────

-- comments are only visible on submissions the guest can see
-- (the subquery runs under the submissions select policy above)
drop policy if exists "comments readable by anyone" on public.comments;
create policy "comments readable by anyone" on public.comments
  for select using (exists (select 1 from public.submissions s where s.id = submission_id));
drop policy if exists "anon can insert comments" on public.comments;
create index if not exists comments_event_created_idx on public.comments(event_id, created_at desc);

-- ── flood guards (hard per-event caps, whatever path a write takes) ───────

create or replace function public.submissions_flood_guard()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if (select count(*) from public.submissions s
      where s.event_id = new.event_id and s.created_at > now() - interval '1 minute') >= 120 then
    raise exception 'rate limit: too many captures for this event right now' using errcode = 'P0001';
  end if;
  if (select count(*) from public.submissions s where s.event_id = new.event_id) >= 5000 then
    raise exception 'limit: this event has reached its capture limit' using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;
revoke execute on function public.submissions_flood_guard() from public, anon, authenticated;
drop trigger if exists submissions_flood_guard on public.submissions;
create trigger submissions_flood_guard before insert on public.submissions
  for each row execute function public.submissions_flood_guard();

create or replace function public.comments_flood_guard()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if (select count(*) from public.comments c
      where c.event_id = new.event_id and c.created_at > now() - interval '1 minute') >= 60 then
    raise exception 'rate limit: too many comments for this event right now' using errcode = 'P0001';
  end if;
  if (select count(*) from public.comments c where c.submission_id = new.submission_id) >= 200 then
    raise exception 'limit: too many comments on this photo' using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;
revoke execute on function public.comments_flood_guard() from public, anon, authenticated;
drop trigger if exists comments_flood_guard on public.comments;
create trigger comments_flood_guard before insert on public.comments
  for each row execute function public.comments_flood_guard();

-- ── storage (bucket "submissions") ──────────────────────────────────────
-- Create the bucket first in the dashboard (Storage → New bucket):
--   name submissions · public ON · 30 MB limit · MIME types
--   image/jpeg,image/png,image/webp,video/webm,video/mp4,audio/webm,audio/mp4
--
-- No anon INSERT policy: guests upload through one-time signed upload URLs
-- that the server issues after its checks. No SELECT policy either: the
-- bucket is public, so media loads by URL, but nobody can LIST folders.
drop policy if exists "anon can upload to submissions bucket" on storage.objects;
drop policy if exists "anyone can read submissions bucket" on storage.objects;

-- ── realtime ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'submissions') then
    alter publication supabase_realtime add table public.submissions;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;
