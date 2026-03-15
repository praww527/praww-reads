import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Link to="/legal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Legal
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="font-serif text-3xl font-bold">Privacy Policy</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">Last updated: March 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="font-semibold text-base mb-2">1. Who We Are</h2>
          <p className="text-muted-foreground">PRaww Reads is a literary community platform operated from South Africa. We provide services for story sharing, book discovery, and reader social features. If you have any questions about this policy, contact us at <a href="mailto:support@praww.co.za" className="text-primary hover:underline">support@praww.co.za</a>.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">2. Information We Collect</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1.5">
            <li><strong className="text-foreground">Account information</strong> — name, email address, username, and password (stored encrypted).</li>
            <li><strong className="text-foreground">Profile information</strong> — bio, profile photo, and any information you choose to share publicly.</li>
            <li><strong className="text-foreground">Content</strong> — stories, chapters, comments, and messages you post on the platform.</li>
            <li><strong className="text-foreground">Usage data</strong> — pages visited, interactions (likes, follows), and session information to improve your experience.</li>
            <li><strong className="text-foreground">Payment data</strong> — wallet balance and transaction history (no card details are stored by us).</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">3. How We Use Your Information</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1.5">
            <li>To provide and maintain your account and the platform's features.</li>
            <li>To send account-related notifications and verification codes.</li>
            <li>To process earnings, donations, and withdrawal requests.</li>
            <li>To detect and prevent misuse, spam, and violations of our content rules.</li>
            <li>To improve our platform based on aggregated usage patterns.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">4. Data Storage & Security</h2>
          <p className="text-muted-foreground">Your data is stored securely on MongoDB Atlas, hosted in a cloud environment with encryption at rest and in transit. Direct messages are end-to-end encrypted and can only be read by the participants. We follow industry-standard security practices and regularly review our systems.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">5. Sharing Your Information</h2>
          <p className="text-muted-foreground">We do not sell or share your personal information with third parties for marketing purposes. Public content (stories, comments, profile) is visible to other users by design. We may disclose information if required by South African law or to protect the safety of our users.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">6. Your Rights</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1.5">
            <li>You can update or delete your profile information at any time.</li>
            <li>You can request deletion of your account and associated data by contacting us.</li>
            <li>You can request a copy of the personal data we hold about you.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">7. Cookies</h2>
          <p className="text-muted-foreground">We use browser local storage (not third-party tracking cookies) to maintain your login session. No advertising cookies are used.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">8. Changes to This Policy</h2>
          <p className="text-muted-foreground">We may update this policy from time to time. Significant changes will be communicated through an in-app notification. Continued use of PRaww Reads after changes are posted constitutes your acceptance.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">9. Contact Us</h2>
          <p className="text-muted-foreground">For privacy-related concerns, email us at <a href="mailto:support@praww.co.za" className="text-primary hover:underline">support@praww.co.za</a>.</p>
        </section>
      </div>
    </div>
  );
}
