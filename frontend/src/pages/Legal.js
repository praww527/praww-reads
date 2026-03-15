import { Link } from "react-router-dom";
import { ArrowLeft, Shield, ScrollText, BookOpen, Mail, ChevronRight } from "lucide-react";

const items = [
  {
    to: "/legal/privacy",
    icon: <Shield className="h-5 w-5 text-primary" />,
    label: "Privacy Policy",
    desc: "How we collect, use, and protect your data.",
  },
  {
    to: "/legal/terms",
    icon: <ScrollText className="h-5 w-5 text-primary" />,
    label: "Terms of Service",
    desc: "The rules and conditions for using PRaww Reads.",
  },
  {
    to: "/legal/content-rules",
    icon: <BookOpen className="h-5 w-5 text-primary" />,
    label: "Content Rules for Writers",
    desc: "What you can publish and our AI content policy.",
  },
  {
    to: "/legal/contact",
    icon: <Mail className="h-5 w-5 text-primary" />,
    label: "Contact & Support",
    desc: "Get help or report an issue — support@praww.co.za",
  },
];

export default function Legal() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <h1 className="font-serif text-3xl font-bold mb-1">Legal</h1>
      <p className="text-sm text-muted-foreground mb-8">Transparency and compliance information for PRaww Reads.</p>

      <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
        {items.map(({ to, icon, label, desc }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors group"
          >
            <div className="w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center shrink-0">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          </Link>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-10">
        PRaww Reads · South Africa ·{" "}
        <a href="mailto:support@praww.co.za" className="hover:text-primary transition-colors">
          support@praww.co.za
        </a>
      </p>
    </div>
  );
}
