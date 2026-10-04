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

### 2b. Storage bucket (do this before the SQL)
Storage → **New bucket**:

| Setting | Value |
|---|---|
| Name | `submissions` |
| Public bucket | **on** |
| File size limit | `30 MB` |
| Allowed MIME types | `image/jpeg,image/png,image/webp,video/webm,video/mp4,audio/webm,audio/mp4` |

The `audio/*` types are needed for the voice guestbook.

### 2c. Run the schema
SQL Editor → New query → paste **all** of
[`supabase/schema.sql`](supabase/schema.sql) → **Run**.

It sets up the tables, the security rules (couple's token hidden from
guests, no self-approval, reveal/expiry enforced by the database), the
storage upload policy and realtime. It's safe to run again; re-run it
whenever that file changes.

### 2d. Check realtime
Database → Publications → `supabase_realtime` should list `submissions` and
`comments`. The SQL adds them, so this is only a check.

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
6. **Moderation:** in the portal, turn auto-approve **off**, then take a
   photo on Phone B. It should appear in the portal as pending and **not**
   in the guest gallery. Approve it and it shows up. Hide one while the TV
   display is open and it should disappear within a second or two.
7. **Install as an app:** on iPhone open the site in Safari → Share → **Add
   to Home Screen**. On Android, Chrome offers **Install app**. It opens
   full-screen with the GG icon.
8. Test inside **Instagram / WhatsApp**: DM yourself the link and open it
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

## Payments and contact
There's no checkout in the app on purpose. Quotes and invoices go out through
**ShootProof**, and every inquiry and contact link on the site goes to
**hello@goldenglancestudio.com** (set in `lib/contact.ts`). Once a couple
books, create their event in `/admin` and send them the QR and portal link.

## Not built yet (optional before going public)
Terms / Privacy / refund policy pages, error monitoring (Sentry) and
analytics, a storage cleanup job for expired galleries, and Upstash-backed
rate limiting.
