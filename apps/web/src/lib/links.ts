// Centralized external/legal links so the settings modal, login form, and any
// future footer all point at the same targets. Override the GitHub base via
// NEXT_PUBLIC_GITHUB_URL if the repo ever moves.

const GITHUB = process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/ramButTan-hw/crecoard";

export const LINKS = {
  github: GITHUB,
  docs: `${GITHUB}#readme`,
  reportBug: `${GITHUB}/issues/new`,
  privacy: "/privacy",
  terms: "/terms",
};

/** True for links that leave the app and should open in a new tab. */
export function isExternalLink(href: string): boolean {
  return /^https?:\/\//.test(href);
}
