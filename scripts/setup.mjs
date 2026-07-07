#!/usr/bin/env node
// One-shot local setup: creates apps/web/.env.local pre-filled with your local
// Supabase credentials, so contributors never have to hunt for keys.
//
//   npx supabase start   # boot local Supabase (needs Docker) + apply migrations
//   npm run setup        # write apps/web/.env.local from the running stack
//   npm run dev
//
// - Never overwrites an existing .env.local (protects your real keys).
// - Only fills the two required Supabase vars; every optional integration key
//   stays a placeholder, since routes 503 gracefully without them.

import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const example = join(root, "apps", "web", ".env.example");
const local = join(root, "apps", "web", ".env.local");

if (existsSync(local)) {
  console.log("✓ apps/web/.env.local already exists — leaving it untouched.");
  process.exit(0);
}
if (!existsSync(example)) {
  console.error("✗ Couldn't find apps/web/.env.example — run this from the repo root.");
  process.exit(1);
}

// Pull live credentials from a running local Supabase, if there is one.
let creds = null;
try {
  const out = execSync("npx supabase status -o env", {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const pick = (key) => {
    const m = out.match(new RegExp(`^${key}="?([^"\\r\\n]+)"?`, "m"));
    return m ? m[1] : null;
  };
  const url = pick("API_URL");
  const anon = pick("ANON_KEY");
  const service = pick("SERVICE_ROLE_KEY");
  if (url && anon) creds = { url, anon, service };
} catch {
  /* not running / not installed — handled below */
}

if (creds) {
  let content = readFileSync(example, "utf8")
    .replace(/^NEXT_PUBLIC_SUPABASE_URL=.*$/m, `NEXT_PUBLIC_SUPABASE_URL=${creds.url}`)
    .replace(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*$/m, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${creds.anon}`);
  if (creds.service) {
    content = content.replace(/^SUPABASE_SERVICE_ROLE_KEY=.*$/m, `SUPABASE_SERVICE_ROLE_KEY=${creds.service}`);
  }
  writeFileSync(local, content);
  console.log("✓ Wrote apps/web/.env.local using your local Supabase credentials.");
  console.log("\nNext:  npm run dev");
} else {
  copyFileSync(example, local);
  console.log("• Local Supabase isn't running, so I copied .env.example → apps/web/.env.local with placeholders.");
  console.log("\nTo auto-fill the Supabase keys, run local Supabase first, then re-run setup:");
  console.log("  1. npx supabase start        (needs Docker)");
  console.log("  2. rm apps/web/.env.local");
  console.log("  3. npm run setup");
  console.log("\nOr just paste your own Supabase URL + anon key into apps/web/.env.local.");
}
