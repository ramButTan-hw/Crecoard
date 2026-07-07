# Contributing to Crecoard

Thanks for your interest in contributing! This guide gets you from a fresh clone to a running local instance, and covers how to submit changes.

## Ground rules

- Be respectful and constructive.
- For anything non-trivial, open an issue to discuss the approach before investing a lot of time.
- By contributing, you agree your contributions are licensed under the project's [MIT License](LICENSE).

## Prerequisites

- **Node.js 20+**
- **npm** (this repo uses npm workspaces)
- **Docker** — optional, but the easiest way to run the database (see below)

## 1. Fork and clone

```bash
git clone https://github.com/<your-username>/crecoard.git
cd crecoard
npm install
```

## 2. Set up the app

### Recommended Docker Setup (fast)

Requires [Docker](https://www.docker.com/).

```bash
npx supabase start   # boots local Supabase + applies supabase/migrations/ (needs Docker)
npm run setup        # writes apps/web/.env.local from the running local Supabase
npm run dev          # http://localhost:3000
```

`npm run setup` fills in the two required Supabase vars for you and never overwrites an existing `.env.local`. The optional integration keys (YouTube, Twitch, Steam, email, push) can stay unset; each just returns 503 until you add a key for the feature you're actually going to work on.

Re-apply the schema later with `npx supabase db reset`.

### Prefer a cloud Supabase?

1. Create a free project at https://supabase.com.
2. Apply the schema: run each file in `supabase/migrations/` **in order** in the SQL editor (or `supabase db push` if you link the project).
3. `cp apps/web/.env.example apps/web/.env.local`, then paste your Project URL + anon key (from **Settings → API**) into the two `NEXT_PUBLIC_SUPABASE_*` vars.

Other scripts: `npm run build`, `npm run lint`, `npm run type-check`.

## Project layout

```
apps/web/       Next.js web app
apps/desktop/   Electron desktop shell
packages/       Shared code
supabase/       Postgres schema + RLS + RPCs (migrations/)
docs/           Widget + bot API reference
```

## Making changes

- Branch off `main`: `git checkout -b feat/short-description` (or `fix/...`).
- Keep each PR focused on one logical change.
- Before opening a PR, make sure:
  - `npm run type-check` passes
  - `npm run lint` passes
  - The app runs and your change actually works
- If you touch the widget or bot APIs, update the relevant file in `docs/`.

## Submitting a pull request

1. Push your branch to your fork.
2. Open a PR against `main` describing **what** changed and **why**.
3. PRs are **squash-merged**, so your PR title becomes the final commit message — make it descriptive (e.g. `fix: prevent duplicate download counts`).
4. Be responsive to review feedback.

## Reporting bugs or requesting features

Open an issue with clear reproduction steps (for bugs) or the use case you have in mind (for features). Screenshots and short recordings help a lot.

---

Thanks for helping make Crecoard better!
