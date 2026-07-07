# Crecoard

**A collaborative visual workspace — an infinite board canvas where you build your workflow out of drag-and-drop blocks, custom widgets, and shared spaces.**

Crecoard blends a freeform board (think Notion-meets-a-whiteboard) with real-time collaboration, a Discord-style server model, a sandboxed widget platform, and a community marketplace for sharing what you build. It ships as both a web app and a native desktop app.

> **Live:** [crecoard.com](https://crecoard.com)

<!-- Add 2–3 screenshots or a short GIF here — this is the first thing a reviewer looks at. -->
<!-- ![Board canvas](docs/screenshot-board.png) -->

---

## Highlights

**Board canvas**
- Infinite, pannable/zoomable canvas with drag-and-drop blocks and rich item types — tasks, kanban, calendars, notes, media/playlists, images, and audio visualizers.
- Custom backgrounds, live wallpapers, and per-board themes.
- Touch-first: pinch-zoom, two-finger pan, and a responsive mobile layout.

**Real-time collaboration & servers**
- Discord-style server sidebar with shared "server boards."
- Roles and permissions, plus in-canvas chat with @mentions, reactions, replies, pins, and moderation.

**Widget / plugin platform**
- Sandboxed custom widgets governed by a capability-based **permission model** with an install-time consent gate.
- Installable community items and a bots REST API for programmatic board access.

**Community marketplace**
- Publish whole boards, single blocks, or individual items.
- Browse by category with search, star ratings, likes, download counts, a featured spotlight, and cover + screenshot galleries.

**Desktop app (Electron)**
- System tray, close-to-tray, launch-on-startup, a global quick-capture hotkey, and auto-update.

**Reminders & scheduling**
- Email + web-push notifications and a one-way ICS calendar feed.

**Onboarding**
- First-run guided tour and a curated starter palette to avoid blank-canvas overwhelm.

---

## Tech stack

| Layer | Tools |
| --- | --- |
| Web | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Zustand |
| Backend | Supabase — Postgres with Row-Level Security, Auth, Storage, Realtime; SQL migrations, RPC functions, and triggers |
| Desktop | Electron, electron-builder, electron-updater |
| Tooling | Turborepo, npm workspaces |

**Architecture notes worth a look:** the RLS + `SECURITY DEFINER` RPC pattern for counters and moderation (`supabase/migrations/`), the widget permission envelope and consent gate, and the Zustand board store that serializes/deserializes entire boards for the marketplace.

---

## Monorepo layout

```
apps/
  web/        Next.js web app (crecoard.com)
  desktop/    Electron thin shell + native integrations
packages/     Shared code
supabase/
  migrations/ Postgres schema, RLS policies, and RPC functions
```

---

## Running locally

Requires **Node 20+** and a free [Supabase](https://supabase.com) project.

```bash
npm install

# Configure the web app
cp apps/web/.env.example apps/web/.env.local
# → fill in your Supabase URL + anon key (and any optional service keys)

# Apply the database schema to your Supabase project
# (run the files in supabase/migrations/ in order via the Supabase SQL editor)

npm run dev        # starts the web app via Turborepo
```

Other scripts: `npm run build`, `npm run lint`, `npm run type-check`.

---

## About this repository

This is a **curated public snapshot** of Crecoard, a project I design, build, and run at [crecoard.com](https://crecoard.com). The full development history and deployment/infrastructure configuration are kept private; this repo is published as a clean snapshot for portfolio and code review.

## License

[MIT](LICENSE) © Jintian Wu
