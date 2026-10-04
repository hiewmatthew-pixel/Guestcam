# Golden Glance · GlanceCam

A small Progressive Web App for wedding guests: scan a QR code, capture
film-look photos and short videos of the couple, and everything lands in one
shared gallery for the night.

Built for [Golden Glance Studio](https://goldenglancestudio.com).

---

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** for styling
- **WebGL** fragment shaders for live film LUTs (custom, no external dep)
- **Supabase** for Postgres + Storage + Realtime (optional — demo mode works
  without it)
- **qrcode.react**, **jszip**, **framer-motion**

---

## Quick start

```bash
cp .env.example .env.local        # fill in if you want Supabase, else leave blank
npm install
npm run dev                       # http://localhost:3000
```

Open `http://localhost:3000` on desktop to browse, but the camera flow needs
**HTTPS** — see the iPhone testing section below.

The app boots in **demo mode** by default when Supabase env vars are missing
or when the "demo mode" toggle is on. In demo mode, captures are stored in
`localStorage` on the device.

Routes:

- `/` — marketing landing
- `/admin` — password gate, create events, view QR + gallery, download zip
- `/event/[slug]` — guest welcome + camera
- `/event/[slug]/gallery` — live gallery (Supabase realtime or localStorage)
- `/event/demo` — always-available demo event for testing

---

## Environment variables (`.env.local`)

```bash
# Public — exposed to the browser bundle (safe by design)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...

# Server-only — NEVER prefix with NEXT_PUBLIC_, never expose to the client
SUPABASE_SERVICE_ROLE_KEY=ey...    # used by server actions to bypass RLS
ADMIN_PASSWORD=use-something-strong
```

If the Supabase vars are missing, the app silently falls back to demo
mode (localStorage). If `SUPABASE_SERVICE_ROLE_KEY` is missing the app
still runs, but admin event create/delete/rotate-token will return a
clear "server not configured" error instead of silently using a less
secure path.

---

## Supabase setup

1. Create a new Supabase project at https://supabase.com.
2. **Storage** → New bucket:
   - Name: `submissions`, Public: **yes**, File size limit: `30 MB`
   - Allowed MIME types: `image/jpeg,image/png,image/webp,video/webm,video/mp4,audio/webm,audio/mp4`
3. **SQL editor** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → Run.
   It's idempotent, so the same file sets up a new project *and* upgrades
   an existing one. It creates the tables, RLS policies, storage policies
   and realtime publication.
4. Re-run it whenever `supabase/schema.sql` changes.
5. What the schema enforces (so the anon key in the browser can't
   bypass it):
   - `manage_token` is never selectable by anon (column-level grants).
   - Guests can't set `approved` themselves; a trigger copies the
     event's auto-approve setting.
   - The gallery reveal time and expiry are enforced in the select
     policy, not just in the UI.
   - `media_url` must point into this event's folder of the bucket.
   - There's no storage list policy, so nobody can enumerate files.
   - All event mutations and moderation go through server actions that
     use the service-role key after checking the admin cookie or the
     couple's token. The service-role key must never be in a
     `NEXT_PUBLIC_*` variable.
6. Copy your project URL and **anon** key from Settings → API into
   `.env.local`. Restart `npm run dev`.

---

## Testing on your iPhone over local network

Camera APIs (`getUserMedia`) require **HTTPS** on any host except
`localhost`. You have two options.

### Option A — `next dev --experimental-https` (recommended)

Next 14 can generate a self-signed cert and serve over HTTPS.

```bash
npm run dev:https
```

The first run prints something like:

```
- ready started server on https://localhost:3000
- HTTPS certificates generated at ~/.next/.cert/
```

**Find your computer's LAN IP**:

- macOS: `ipconfig getifaddr en0` (Wi-Fi) — e.g. `192.168.1.42`
- Linux: `hostname -I | awk '{print $1}'`

Next dev binds to all interfaces by default, but you can be explicit:

```bash
npx next dev --experimental-https -H 0.0.0.0 -p 3000
```

Then on your iPhone:

1. Connect to the **same Wi-Fi** as your computer.
2. Open Safari and go to `https://192.168.1.42:3000` (your IP).
3. Safari will warn about the self-signed cert. Tap **"Show details"
   → "visit this website"**. (If iOS refuses entirely, see Option B.)
4. Trust the cert for the session.

If Safari still refuses, you can install the dev cert on the iPhone:

- The cert lives at `~/.next/.cert/development/localhost.pem`
- AirDrop it to your iPhone → tap → install profile
- Settings → General → About → **Certificate Trust Settings** → enable
  trust for the cert.

### Option B — ngrok tunnel (zero cert hassle)

If the self-signed cert is friction, tunnel localhost through ngrok and
you get a real cert.

```bash
# in one terminal
npm run dev

# in another terminal
brew install ngrok                 # or download from ngrok.com
ngrok http 3000
```

ngrok will print a URL like `https://abcd-12-34.ngrok-free.app`. Open
that on your iPhone. Real cert, no warnings.

### Test plan on the iPhone

1. Open the dev URL → land on `/`.
2. Tap **"try the camera"** → lands on `/event/demo`.
3. On the welcome screen, leave name blank or type one, tap **open the
   camera**.
4. Allow camera access when Safari prompts.
5. Scroll through filters at the bottom — confirm each one changes the
   look in real time (warmer with Portra, halated reds with Cinestill,
   B&W with HP5, etc).
6. Tap the gold circle → preview appears → tap **send to the couple**.
   Confirmation reads "Your moment is saved ✦".
7. Switch to **video**, tap the circle to start, watch the gold ring
   animate, tap again (or wait 15s) to stop. Preview a ~10s clip.
8. Tap **gallery** (bottom-right of the camera) → confirm both items
   appear in the masonry grid.
9. Tap any item to open fullscreen, tap **X**/elsewhere to close.

If the camera screen says "WebGL not available", you're on a device
without WebGL — the app should still show the unfiltered camera and let
you capture. That's the graceful fallback.

---

## Demo mode

There's a toggle on both the welcome screen and the admin page.
Demo mode forces the app to ignore Supabase and use `localStorage`.

This is also what runs automatically if you haven't filled in your
Supabase env vars. The `/event/demo` slug always works regardless.

---

## File tree

```
.
├── app/
│   ├── admin/
│   │   ├── [slug]/
│   │   │   ├── AdminEventDetail.tsx
│   │   │   └── page.tsx
│   │   ├── AdminEventList.tsx
│   │   ├── LoginForm.tsx
│   │   ├── actions.ts
│   │   └── page.tsx
│   ├── event/
│   │   └── [slug]/
│   │       ├── gallery/page.tsx
│   │       ├── portal/[token]/page.tsx
│   │       └── page.tsx
│   ├── pricing/
│   │   └── page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── BirdLogo.tsx
│   ├── CaptureButton.tsx
│   ├── FilteredCamera.tsx
│   ├── FilterSelector.tsx
│   ├── Gallery.tsx
│   └── QRCode.tsx
├── lib/
│   ├── demo-store.ts
│   ├── filters.ts
│   ├── supabase.ts
│   ├── tiers.ts
│   ├── tokens.ts
│   └── zip.ts
├── styles/
│   └── globals.css
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## Known gotchas

- **iOS Safari + MediaRecorder**: iOS 14.3+ supports MediaRecorder on
  the canvas-capture stream. The recorder tries `video/mp4;codecs=avc1`
  first (Safari's preferred), then falls back to WebM. If recording
  silently fails, your iOS version is probably too old — upgrade or
  switch the device to photo-only.
- **Filters at full resolution**: capture is done from the GL canvas at
  the camera's native resolution (typically 1280×720), so what you see
  is what you save.
- **Storage costs**: each video can be 1–4 MB at 720p / 15 s. The free
  Supabase tier (1 GB) holds ~250 clips. Plan accordingly for a real
  wedding.
- **HTTP on LAN**: cameras *will not* work over plain HTTP except on
  `localhost`. You must use HTTPS or a tunnel.
