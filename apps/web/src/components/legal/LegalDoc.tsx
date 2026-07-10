import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Shared layout for the Privacy Policy and Terms of Service pages. Server
// component — no interactivity. Styled with CSS-var fallbacks so it renders
// correctly before the app theme loads (these pages are public / pre-auth).

export function LegalDoc({ title, updated, children }: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{ background: "var(--surface, #0d0e11)", color: "var(--text-primary, #e7e7ea)" }}
    >
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-muted, #9a9aa2)" }}
        >
          <ArrowLeft size={15} /> Back to Crecoard
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted, #9a9aa2)" }}>
          Last updated: {updated}
        </p>

        <div className="legal-body mt-8 flex flex-col gap-6 text-sm leading-relaxed">
          {children}
        </div>

        <p
          className="mt-12 rounded-lg border px-4 py-3 text-xs leading-relaxed"
          style={{ borderColor: "var(--border, #2a2b31)", color: "var(--text-muted, #9a9aa2)", background: "var(--surface-raised, #16171b)" }}
        >
          This is a starting template, not legal advice. Before launch, have it reviewed and fill in the
          bracketed placeholders (operator name, jurisdiction, and contact address).
        </p>
      </div>
    </main>
  );
}

/** A titled section within a legal document. */
export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold" style={{ color: "var(--text-primary, #e7e7ea)" }}>{heading}</h2>
      <div className="flex flex-col gap-2" style={{ color: "var(--text-secondary, #c4c4cc)" }}>
        {children}
      </div>
    </section>
  );
}
