import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Clock, MessageCircle, HelpCircle } from "lucide-react";

export default function ContactSupport() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Link to="/legal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Legal
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Mail className="h-6 w-6 text-primary" />
        <h1 className="font-serif text-3xl font-bold">Contact & Support</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">We are here to help. Reach out any time.</p>

      <div className="space-y-6">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Email Support</h2>
              <p className="text-xs text-muted-foreground">Our primary support channel</p>
            </div>
          </div>
          <a href="mailto:support@praww.co.za"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            support@praww.co.za
          </a>
          <p className="text-sm text-muted-foreground mt-2">Send us an email and we'll get back to you as soon as possible. Please include your username and a clear description of your issue to help us assist you faster.</p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <h2 className="font-semibold text-base">Response Times</h2>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span>General enquiries</span>
              <span className="font-medium text-foreground">1–3 business days</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span>Account or payment issues</span>
              <span className="font-medium text-foreground">1–2 business days</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span>Content removal requests</span>
              <span className="font-medium text-foreground">Within 24 hours</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span>Safety & abuse reports</span>
              <span className="font-medium text-foreground">Urgent — same day</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
              <HelpCircle className="h-5 w-5 text-violet-500" />
            </div>
            <h2 className="font-semibold text-base">Common Topics</h2>
          </div>
          <div className="space-y-3 text-sm">
            {[
              { topic: "Account access or password reset", note: "Include your email address." },
              { topic: "Premium membership or billing", note: "Include your transaction reference if applicable." },
              { topic: "Wallet & withdrawal requests", note: "Include your username and the amount." },
              { topic: "Reporting a story or user", note: "Include a link to the content and the reason." },
              { topic: "Appealing a content removal", note: "Include the story title and your explanation." },
              { topic: "Copyright infringement claim", note: "Provide proof of ownership and the infringing URL." },
            ].map(({ topic, note }) => (
              <div key={topic} className="flex flex-col gap-0.5 py-2 border-b border-border last:border-0">
                <span className="font-medium text-foreground">{topic}</span>
                <span className="text-muted-foreground text-xs">{note}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5 text-green-500" />
            </div>
            <h2 className="font-semibold text-base">Ready to reach us?</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Tap the button below to open your email app with our support address pre-filled.</p>
          <a href="mailto:support@praww.co.za?subject=PRaww Reads Support Request"
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors">
            <Mail className="h-4 w-4" /> Email Support
          </a>
        </div>
      </div>
    </div>
  );
}
