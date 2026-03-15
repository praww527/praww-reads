import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";

export default function ContentRules() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Link to="/legal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Legal
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="h-6 w-6 text-primary" />
        <h1 className="font-serif text-3xl font-bold">Content Rules for Writers</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">Last updated: March 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="font-semibold text-base mb-2">Our Community Standard</h2>
          <p className="text-muted-foreground">PRaww Reads is a space for authentic storytelling. We welcome original voices across all genres — fiction, non-fiction, poetry, essays, and more. These rules exist to keep the community safe, creative, and enjoyable for everyone.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-3">What Is Allowed</h2>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2"><span className="text-green-500 font-bold mt-0.5">✓</span> Original fiction and non-fiction across all genres (romance, thriller, sci-fi, literary, etc.).</li>
            <li className="flex items-start gap-2"><span className="text-green-500 font-bold mt-0.5">✓</span> Poetry, essays, memoirs, and creative non-fiction.</li>
            <li className="flex items-start gap-2"><span className="text-green-500 font-bold mt-0.5">✓</span> Mature themes handled with literary intent (must be clearly tagged).</li>
            <li className="flex items-start gap-2"><span className="text-green-500 font-bold mt-0.5">✓</span> Stories inspired by real events, provided they do not defame real people.</li>
            <li className="flex items-start gap-2"><span className="text-green-500 font-bold mt-0.5">✓</span> Fan fiction that does not infringe on copyright or present real individuals negatively.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-3">What Is Not Allowed</h2>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2"><span className="text-destructive font-bold mt-0.5">✗</span> <span><strong className="text-foreground">Plagiarism.</strong> Copying another person's work without permission and presenting it as your own.</span></li>
            <li className="flex items-start gap-2"><span className="text-destructive font-bold mt-0.5">✗</span> <span><strong className="text-foreground">Hate speech.</strong> Content that promotes violence or discrimination based on race, gender, religion, sexual orientation, or other protected characteristics.</span></li>
            <li className="flex items-start gap-2"><span className="text-destructive font-bold mt-0.5">✗</span> <span><strong className="text-foreground">Explicit sexual content involving minors.</strong> This is strictly prohibited and will result in immediate permanent banning and reporting to authorities.</span></li>
            <li className="flex items-start gap-2"><span className="text-destructive font-bold mt-0.5">✗</span> <span><strong className="text-foreground">Graphic violence with no literary purpose.</strong> Gratuitous gore or torture content not serving a narrative function.</span></li>
            <li className="flex items-start gap-2"><span className="text-destructive font-bold mt-0.5">✗</span> <span><strong className="text-foreground">Spam and duplicate content.</strong> Publishing the same story multiple times or flooding the feed.</span></li>
            <li className="flex items-start gap-2"><span className="text-destructive font-bold mt-0.5">✗</span> <span><strong className="text-foreground">Misinformation.</strong> Deliberately false information presented as fact with intent to mislead.</span></li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">AI-Assisted Content Policy</h2>
          <p className="text-muted-foreground mb-2">We respect writers who use AI tools as part of their creative process. However, transparency matters to our community:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1.5">
            <li>Stories that our system detects as significantly AI-generated will be labelled with an <strong className="text-foreground">AI ASSIST</strong> badge automatically.</li>
            <li>Fully AI-generated stories submitted without any human creative input may be rejected by our content gate.</li>
            <li>Using AI to paraphrase or disguise plagiarised content is a serious violation and grounds for permanent removal.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">Monetisation Rules</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1.5">
            <li>Only original content you own the rights to may be monetised.</li>
            <li>A <strong className="text-foreground">30% platform commission</strong> applies to all story sales and donations.</li>
            <li>Content found to violate these rules will be demonetised and earnings may be withheld.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">Enforcement</h2>
          <p className="text-muted-foreground">Violations may result in content removal, temporary suspension, or permanent account termination depending on severity. Repeat violations escalate consequences. You may appeal moderation decisions by contacting us.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2">Questions?</h2>
          <p className="text-muted-foreground">Reach us at <a href="mailto:support@praww.co.za" className="text-primary hover:underline">support@praww.co.za</a>.</p>
        </section>
      </div>
    </div>
  );
}
