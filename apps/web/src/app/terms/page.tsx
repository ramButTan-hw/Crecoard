import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, LegalSection } from "@/components/legal/LegalDoc";

export const metadata: Metadata = {
  title: "Terms of Service — Crecoard",
  description: "The terms that govern your use of Crecoard.",
};

export default function TermsPage() {
  return (
    <LegalDoc title="Terms of Service" updated="July 9, 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the Crecoard web and desktop apps
        (the &ldquo;Service&rdquo;), operated by [operator name]. By using the Service you agree to these Terms.
        If you don&rsquo;t agree, please don&rsquo;t use the Service.
      </p>

      <LegalSection heading="The service">
        <p>Crecoard is a modular board planner for organizing tasks, notes, and projects, with optional collaboration, messaging, reminders, and a desktop app. We may add, change, or remove features over time.</p>
      </LegalSection>

      <LegalSection heading="Accounts &amp; eligibility">
        <p>You may use the Service with an account or as a guest. You&rsquo;re responsible for keeping your account credentials secure and for activity under your account. You must be old enough to form a binding contract in your jurisdiction to create an account.</p>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>You retain ownership of the content you create. You grant us the limited rights needed to store, display, and process your content so we can operate the Service and provide it back to you and any collaborators you share it with. You&rsquo;re responsible for the content you add and for having the rights to any images or files you upload.</p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>Don&rsquo;t use the Service to break the law, infringe others&rsquo; rights, upload malware, harass others, or attempt to disrupt or gain unauthorized access to the Service or its infrastructure. We may suspend or remove content or accounts that violate these Terms.</p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>The Service integrates optional third-party services (for example YouTube, Steam, Twitch, Tracker.gg, and sign-in providers). Your use of those services through Crecoard is also subject to their own terms, and we&rsquo;re not responsible for their content or availability.</p>
      </LegalSection>

      <LegalSection heading="Open source">
        <p>Crecoard is open source. The source code is provided under the license in its public repository, and your use of the code (as opposed to the hosted Service) is governed by that license.</p>
      </LegalSection>

      <LegalSection heading="Disclaimers">
        <p>The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind. We don&rsquo;t guarantee that it will be uninterrupted, error-free, or that your data will never be lost. Keep your own backups of anything important — you can export boards and archives from within the app.</p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>To the maximum extent permitted by law, [operator name] will not be liable for any indirect, incidental, or consequential damages, or for loss of data or profits, arising from your use of the Service.</p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>You may stop using the Service at any time. We may suspend or terminate access if you violate these Terms or to protect the Service. You can request deletion of your account and data as described in our{" "}
          <Link href="/privacy" className="underline hover:opacity-80" style={{ color: "var(--accent, #d59ee8)" }}>Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>We may update these Terms from time to time. Material changes will be reflected by the &ldquo;Last updated&rdquo; date above; continued use after changes means you accept them.</p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>These Terms are governed by the laws of [jurisdiction], without regard to conflict-of-laws rules.</p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>Questions about these Terms? Reach us at [contact email].</p>
      </LegalSection>
    </LegalDoc>
  );
}
