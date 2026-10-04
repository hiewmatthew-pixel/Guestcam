# Deploying GlanceCam (no payments yet)

This is the path to a live HTTPS URL you can open on your phone for real-device
QA. Payments (Stripe), legal pages and analytics are deliberately left out. You
onboard couples by hand from `/admin`.

There are two stages. Stage 1 alone gets the camera onto your phone in about
10 minutes. Stage 2 makes galleries, portals and multi-guest uploads real.

---

## Stage 1: demo-mode deploy (~10 min, no database)

1. **Vercel → Add New → Project →** import `hiewmatthew-pixel/Guestcam`.
2. Framework preset: **Next.js** (auto-detected). Leave the build command,
   output directory and install command at their defaults.
3. **Environment variables**, add just one:
   - `ADMIN_PASSWORD`: something long and random (not `changeme`).
4. **Deploy.** Then open `https://<your-app>.vercel.app/event/demo` on your phone.

With no Supabase vars the app runs in **demo mode**: captures are saved to that
one phone's `localStorage`. Use this stage to QA camera, filters and strength
slider, photobooth (strip / film / polaroid + timer), stickers, emoji,
boomerang, video with sound, and save-to-phone. The gallery only shows that
device's own captures.

> Vercel deploys from the repo's **production branch** (default `main`). If
> this work is still on a feature branch, either merge it to `main` first, or
> set Settings → Git → Production Branch to the branch you want live.

---

## Stage 2: real backend with Supabase (~30 min)

### 2a. Create the project
supabase.com → **New project**. Pick a region close to your guests. Save the
database password somewhere safe.

### 2b. Run the schema (SQL Editor → New query → paste → Run)

This includes the security grants that keep the couple's `manage_token` away
from guests. **Don't skip the `revoke` / `grant` lines.**

```sql
-- events
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
create index if not exists events_manage_token_idx on public.events(manage_token);


-- submissions
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('photo', 'video', 'boomerang', 'voice')),
  filter_name text not null,
  guest_name text,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists submissions_event_idx on public.submissions(event_id, created_at desc);

-- enable RLS
alter table public.events enable row level security;
alter table public.submissions enable row level security;

-- ANON CAN ONLY READ events. All event create/update/delete + token
-- rotation goes through server actions in app/admin/event-actions.ts
-- that use the SUPABASE_SERVICE_ROLE_KEY after verifying the admin
-- cookie (or, for portal welcome updates, the manage_token).
create policy "events readable by anyone"
  on public.events for select
  using (true);

-- COLUMN-LEVEL SECURITY: manage_token is the couple's portal credential
-- and must NEVER reach the browser. Remove anon's blanket SELECT and
-- re-grant only the guest-safe columns. After this, `select('*')` from
-- the anon key errors; the app uses PUBLIC_EVENT_COLUMNS (lib/supabase.ts)
-- for all guest reads, and portal/admin reads go through server actions
-- that run with the service role (which bypasses these grants).
revoke select on public.events from anon;
grant select (
  id, slug, couple_names, wedding_date, welcome_message,
  tier, reveal_at, auto_approve, created_at
) on public.events to anon;
-- if you use the 'authenticated' role too, mirror the two lines above for it.

-- anyone can read approved submissions (public gallery)
create policy "approved submissions readable by anyone"
  on public.submissions for select
  using (approved = true);

-- anon can insert a submission tied to an existing event row
create policy "anon can insert submissions"
  on public.submissions for insert
  with check (
    media_type in ('photo', 'video', 'boomerang', 'voice')
    and exists (select 1 from public.events e where e.id = event_id)
  );

-- per-photo comments (guests can write short text against a submission)
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
alter table public.comments enable row level security;
create policy "comments readable by anyone" on public.comments for select using (true);
create policy "anon can insert comments" on public.comments for insert
  with check (
    char_length(body) between 1 and 280
    -- the submission must exist AND the event_id must match its owner,
    -- so a comment can't be mis-attributed to the wrong event
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.event_id = comments.event_id
    )
  );

-- intentionally NO policy for anon INSERT/UPDATE/DELETE on events,
-- and NO policy for anon UPDATE/DELETE on submissions/comments.
-- service_role bypasses RLS so server actions still work.
```

### 2c. Storage bucket
Storage → **New bucket**:

| Setting | Value |
|---|---|
| Name | `submissions` |
| Public bucket | **on** |
| File size limit | `30 MB` |
| Allowed MIME types | `image/jpeg,image/png,image/webp,video/webm,video/mp4,audio/webm,audio/mp4` |

The `audio/*` types are needed for the voice guestbook. If you leave them out,
voice uploads get rejected.

Then run these storage policies in the SQL Editor:

```sql
create policy "anon can upload to submissions bucket"
  on storage.objects for insert
  with check (bucket_id = 'submissions');

create policy "anyone can read submissions bucket"
  on storage.objects for select
  using (bucket_id = 'submissions');
```

### 2d. Realtime
Database → **Replication** (or Publications) → `supabase_realtime` → enable
**`submissions`** and **`comments`**.

### 2e. Env vars on Vercel
Settings → Environment Variables (Production + Preview). Values come from
Supabase → Project Settings → API:

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key | **server-only. Never prefix with `NEXT_PUBLIC_`** |
| `ADMIN_PASSWORD` | long random string | changing it logs out every admin session |

### 2f. Redeploy (required)
Deployments → ⋯ on the latest deploy → **Redeploy**. `NEXT_PUBLIC_*` values
and the Content-Security-Policy (which whitelists your Supabase domain) are
baked in **at build time**, so adding env vars without a redeploy leaves the
app in demo mode, or with the CSP blocking Supabase.

---

## Smoke test (two phones)

1. Phone A: `/admin` → log in → **create a test event** (choose the
   Studio tier to unlock every feature).
2. Phone B: scan the event's QR → enter a name → take a photo, a video, a
   boomerang, a photobooth strip and a voice message.
3. Phone A: open the event gallery. Items should appear **without refreshing**
   (realtime). Open one and leave a comment.
4. Open the couple's **portal link** from admin. Moderation hide/approve should
   take effect on the guest gallery.
5. Open `/event/<slug>/display` on a laptop or TV for the slideshow.
6. Test inside **Instagram / WhatsApp**: DM yourself the link and open it
   in-app. You should see the "open in Safari/Chrome" guidance if the camera
   is blocked.

---

## Deploy gotchas (already checked)

- **Node**: `package.json` pins `>=18.17`. Vercel's default (20/22) is fine.
- **HTTPS**: the camera needs it, and Vercel provides it automatically. Custom domains
  also get certs automatically.
- **Rate limiting** is in-memory per serverless instance, so it's best-effort
  on Vercel. That's fine for a soft launch. Back it with Upstash Redis
  before going public.
- **Expired galleries** are hidden from guests, but files are not deleted from
  storage yet. Add a cleanup job before storage costs matter.
- **Free Supabase tier** = 1 GB storage ≈ 250 videos. One busy wedding can fill
  it, so upgrade to Pro before a real event.

## Still not built (needed for a public, self-serve launch)
Stripe checkout + webhook → auto-create event, transactional email (portal link
/ QR), Terms / Privacy / refund policy, error monitoring and analytics.
