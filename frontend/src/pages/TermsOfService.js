import { Link } from "react-router-dom";
import { ArrowLeft, ScrollText } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Link to="/legal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Legal
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <ScrollText className="h-6 w-6 text-primary" />
        <h1 className="font-serif text-3xl font-bold">Terms of Service</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">Last updated: March 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="font-semibold text-base mb-2">1. Acceptance of Terms</h2>
          <p className="text-muted-foreground">By creating an account or using PRaww Reads, you agree to these Terms of Service and our Privacy Policy. If you do not agree, please do not use the platform. These terms are governed by the laws of the Republic of South Africa.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">2. Your Account</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1.5">
            <li>You must be at least 13 years old to use PRaww Reads.</li>
            <li>You are responsible for keeping your account credentials secure.</li>
            <li>You may not impersonate another person or create accounts to bypass a ban.</li>
            <li>Each person may hold only one active account.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">3. Your Content</h2>
          <p className="text-muted-foreground mb-2">You retain full intellectual property rights over stories and content you create. By publishing on PRaww Reads, you grant us a non-exclusive, royalty-free licence to display, distribute, and promote your content within the platform.</p>
          <p className="text-muted-foreground">You must not publish content that you do not have the right to share. Plagiarism or copyright infringement may result in immediate removal and account suspension.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">4. Prohibited Conduct</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1.5">
            <li>Posting content that is hateful, discriminatory, or harassing.</li>
            <li>Spamming other users through messages or comments.</li>
            <li>Attempting to hack, scrape, or disrupt the platform.</li>
            <li>Selling or transferring your account to another person.</li>
            <li>Using the platform for any unlawful purpose.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">5. Monetisation & Payments</h2>
          <p className="text-muted-foreground">Writers can earn through story sales and reader donations. PRaww Reads retains a <strong className="text-foreground">30% platform commission</strong> on all transactions; the remaining 70% is credited to your wallet. Withdrawals are processed manually and are subject to a minimum balance of R100. We reserve the right to withhold earnings from accounts found to be in violation of these terms.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">6. Termination</h2>
          <p className="text-muted-foreground">We may suspend or terminate your account at any time if we determine you have violated these terms. You may also delete your account at any time by contacting us. Upon termination, your public content may be removed.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">7. Disclaimer of Warranties</h2>
          <p className="text-muted-foreground">PRaww Reads is provided "as is" without warranties of any kind. We do not guarantee that the service will be uninterrupted, error-free, or free of harmful components. Use the platform at your own risk.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">8. Limitation of Liability</h2>
          <p className="text-muted-foreground">To the maximum extent permitted by South African law, PRaww Reads shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">9. Changes to Terms</h2>
          <p className="text-muted-foreground">We may update these terms periodically. Continued use of PRaww Reads after changes are published constitutes your acceptance of the revised terms.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">10. Contact</h2>
          <p className="text-muted-foreground">Questions about these terms? Email <a href="mailto:support@praww.co.za" className="text-primary hover:underline">support@praww.co.za</a>.</p>
        </section>
      </div>
    </div>
  );
}
