<p align="center">
  <a href="https://crecoard.com">
    <img src="docs/Crecoard_Banner.png.png" alt="Crecoard" width="100%">
  </a>
</p>
# Crecoard

**A collaborative visual workspace — an infinite board canvas where you build your workflow out of drag-and-drop blocks, custom widgets, and shared spaces.**


> **Live:** [crecoard.com](https://crecoard.com)

<!-- Add 2–3 screenshots or a short GIF here — this is the first thing a reviewer looks at. -->
<!-- ![Board canvas](docs/screenshot-board.png) -->

## Download

Crecoard runs in any browser at **[crecoard.com](https://crecoard.com)** — nothing to install.

Prefer a native app? The **desktop app** (Windows) adds a system tray, a global quick-capture hotkey, and auto-updates in the background:

**[⬇ Download the latest release »](https://github.com/ramButTan-hw/Crecoard-releases/releases/latest)**

---

## Roadmap



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

## License

[MIT](LICENSE) © Jintian Wu
