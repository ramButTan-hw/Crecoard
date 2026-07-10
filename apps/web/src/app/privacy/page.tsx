import type { Metadata } from "next";
import { LegalDoc, LegalSection } from "@/components/legal/LegalDoc";

export const metadata: Metadata = {
  title: "Privacy Policy — Crecoard",
  description: "How Crecoard collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <LegalDoc title="Privacy Policy" updated="July 9, 2026">
      <p>
        This Privacy Policy explains how Crecoard (&ldquo;Crecoard&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;),
        operated by [operator name], handles information when you use the Crecoard web and desktop apps
        (the &ldquo;Service&rdquo;). By using the Service you agree to this policy.
      </p>

      <LegalSection heading="Information we collect">
        <p><strong>Account information.</strong> When you create an account we store your email address, a display name, and — if you choose — a profile picture and banner. Passwords are handled by our authentication provider and are never stored by us in plain text.</p>
        <p><strong>Content you create.</strong> Boards, blocks, items, tables, messages, comments, uploaded images and files, and similar content you add to the Service are stored so we can provide it back to you and any collaborators you share it with.</p>
        <p><strong>Guest / local data.</strong> If you use the Service without an account (&ldquo;Continue without account&rdquo;), your boards are kept only in your browser&rsquo;s local storage on your device and are not sent to our servers.</p>
        <p><strong>Technical data.</strong> We may process basic technical information such as browser type and device information needed to operate and secure the Service.</p>
      </LegalSection>

      <LegalSection heading="How we use information">
        <p>We use your information to provide and maintain the Service, sync your boards across devices, enable collaboration and messaging you opt into, deliver reminders you set up, and keep the Service secure. We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>We rely on a small number of providers to run the Service:</p>
        <p><strong>Supabase</strong> — authentication, database, and file storage. <strong>Google</strong> — optional &ldquo;Sign in with Google&rdquo;. <strong>Email &amp; push providers</strong> — to deliver reminders you schedule.</p>
        <p><strong>Optional integrations.</strong> Item types like YouTube, Steam, Twitch, and Tracker.gg fetch public data from those services when you add them to a board. These requests are made server-side using our own API credentials; we don&rsquo;t share your account details with them.</p>
      </LegalSection>

      <LegalSection heading="Data storage &amp; security">
        <p>Your data is stored with our infrastructure providers and protected by row-level security so that you and your chosen collaborators are the only ones who can access your private boards. No method of transmission or storage is perfectly secure, but we take reasonable measures to protect your information.</p>
      </LegalSection>

      <LegalSection heading="Data retention &amp; deletion">
        <p>We keep your content while your account is active. You can delete boards and content at any time from within the app. To delete your account and associated data, contact us at [contact email]. Guest data lives only in your browser and is removed when you clear your browser storage.</p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>Depending on where you live, you may have the right to access, correct, export, or delete your personal information. To make a request, contact us at [contact email].</p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>The Service is not directed to children under [13/16, per your jurisdiction], and we do not knowingly collect information from them.</p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>We may update this policy from time to time. Material changes will be reflected by the &ldquo;Last updated&rdquo; date above.</p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>Questions about this policy? Reach us at [contact email].</p>
      </LegalSection>
    </LegalDoc>
  );
}
