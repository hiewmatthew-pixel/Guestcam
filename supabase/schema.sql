-- GlanceCam database schema + security. Safe to re-run: every statement
-- is idempotent, so the same file works for a fresh project AND for
-- upgrading an existing one. Paste the whole file into the Supabase SQL
-- editor and press Run.
--
-- Security model:
--   * The anon key ships in the browser, so anon may only READ guest-safe
--     data and INSERT captures/comments. Every event mutation, all
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
  select e.auto_approve into new.approved from public.events e where e.id = new.event_id;
  new.approved := coalesce(new.approved, true);
  return new;
end;
$$;
drop trigger if exists submissions_force_approval on public.submissions;
create trigger submissions_force_approval
  before insert on public.submissions
  for each row execute function public.submissions_force_approval();

-- ── events policies ─────────────────────────────────────────────────────

drop policy if exists "events readable by anyone" on public.events;
create policy "events readable by anyone" on public.events for select using (true);

-- manage_token is the couple's portal credential and must NEVER reach the
-- browser: anon only gets the guest-safe columns.
revoke select on public.events from anon, authenticated;
grant select (
  id, slug, couple_names, wedding_date, welcome_message,
  tier, reveal_at, auto_approve, created_at
) on public.events to anon, authenticated;
-- no insert/update/delete policies on events: server actions only.

-- ── submissions policies ────────────────────────────────────────────────

drop policy if exists "approved submissions readable by anyone" on public.submissions;
create policy "approved submissions readable by anyone" on public.submissions
  for select using (approved and public.event_gallery_open(event_id));

drop policy if exists "anon can insert submissions" on public.submissions;
create policy "anon can insert submissions" on public.submissions
  for insert with check (
    media_type in ('photo', 'video', 'boomerang', 'voice')
    and exists (select 1 from public.events e where e.id = event_id)
    -- media must live in this project's bucket, inside this event's folder
    and media_url like '%/storage/v1/object/public/submissions/' || event_id::text || '/%'
    and media_url not like '%..%'
    and char_length(media_url) <= 500
    and char_length(filter_name) <= 40
    and (guest_name is null or char_length(guest_name) <= 80)
  );
-- no update/delete policies on submissions: moderation is server-side.

-- ── comments policies ───────────────────────────────────────────────────

-- comments are only visible / writable on submissions the guest can see
-- (the subquery runs under the submissions select policy above)
drop policy if exists "comments readable by anyone" on public.comments;
create policy "comments readable by anyone" on public.comments
  for select using (exists (select 1 from public.submissions s where s.id = submission_id));

drop policy if exists "anon can insert comments" on public.comments;
create policy "anon can insert comments" on public.comments
  for insert with check (
    char_length(body) between 1 and 280
    and (guest_name is null or char_length(guest_name) <= 80)
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.event_id = comments.event_id
    )
  );

-- ── storage (bucket "submissions") ──────────────────────────────────────
-- Create the bucket first in the dashboard (Storage → New bucket):
--   name submissions · public ON · 30 MB limit · MIME types
--   image/jpeg,image/png,image/webp,video/webm,video/mp4,audio/webm,audio/mp4

drop policy if exists "anon can upload to submissions bucket" on storage.objects;
create policy "anon can upload to submissions bucket" on storage.objects
  for insert with check (
    bucket_id = 'submissions'
    -- first folder must be a real event id
    and (storage.foldername(name))[1] in (select id::text from public.events)
  );

-- No SELECT policy on purpose: the bucket is public, so media loads by
-- URL without one. A select policy would let anyone LIST every event's
-- folder and bypass the reveal/expiry gate above. (Older installs had
-- one; this removes it.)
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
