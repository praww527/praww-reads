import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export default function AddChapter() {
  const { id: storyId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const [story, setStory] = useState(null);
  const [loadingStory, setLoadingStory] = useState(true);
  const [accessError, setAccessError] = useState("");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [aiChecking, setAiChecking] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch(`/stories/${storyId}`);
        if (!data || data.author_id !== user?.id) {
          setAccessError("You are not the author of this story.");
        } else {
          setStory(data);
        }
      } catch {
        setAccessError("Story not found.");
      } finally {
        setLoadingStory(false);
      }
    }
    if (isAuthenticated && user) load();
  }, [storyId, isAuthenticated, user]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setAiResult(null);
    setAiError("");
    setSubmitError("");

    setAiChecking(true);
    try {
      const check = await apiFetch("/stories/check-ai", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setAiResult(check);
    } catch (err) {
      setAiError(err.message || "AI check failed. Please try again.");
    } finally {
      setAiChecking(false);
    }
  }

  async function doPublish() {
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch(`/stories/${storyId}/chapters`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), content }),
      });
      navigate(`/stories/${storyId}`, { replace: true });
    } catch (err) {
      setSubmitError(err.message || "Failed to publish chapter.");
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Please <Link to="/login" className="text-primary underline">log in</Link> to add chapters.</p>
      </div>
    );
  }

  if (loadingStory) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-destructive font-medium mb-4">{accessError}</p>
        <Link to="/" className="text-primary underline text-sm">Go home</Link>
      </div>
    );
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  const scoreColor = aiResult
    ? aiResult.score >= 80
      ? "border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800"
      : aiResult.score >= 40
      ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"
      : "border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-800"
    : "";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to={`/stories/${storyId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to story
        </Link>
      </div>

      <div className="mb-6">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Adding chapter to</p>
        <h1 className="font-serif text-2xl font-bold text-foreground">{story?.title}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">Chapter Title</label>
          <input
            type="text"
            value={title}
            onChange={e => { setTitle(e.target.value); setAiResult(null); }}
            placeholder="e.g. Chapter 3: The Return"
            maxLength={200}
            required
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Content
            <span className="ml-2 text-xs text-muted-foreground font-normal">{wordCount.toLocaleString()} words</span>
          </label>
          <textarea
            value={content}
            onChange={e => { setContent(e.target.value); setAiResult(null); }}
            placeholder="Write your chapter here..."
            rows={22}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary resize-y font-serif"
          />
        </div>

        {aiError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {aiError}
          </div>
        )}

        {submitError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        {aiResult && (() => {
          const score = aiResult.score ?? 0;
          const verdict = aiResult.verdict;
          const blocked = score >= 80;
          const warning = !blocked && score >= 40;
          const clean = !blocked && !warning;
          return (
            <div className={`rounded-2xl border p-5 ${scoreColor}`}>
              <div className="flex items-start gap-3 mb-4">
                {clean && <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />}
                {warning && <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
                {blocked && <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm mb-0.5">
                    {clean && "Content verified — looks human-written"}
                    {warning && "Possible AI patterns detected"}
                    {blocked && "Publishing rejected — AI score too high"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    AI confidence score: <strong>{score}/100</strong>
                    {aiResult.indicators?.length > 0 && (
                      <> · Flags: {aiResult.indicators.join(", ")}</>
                    )}
                  </p>
                </div>
              </div>

              {blocked && (
                <p className="text-sm text-red-700 dark:text-red-400 mb-4">
                  Your chapter scored {score}/100 on our AI detection check. Please revise your content to make it more personal and original, then try again.
                </p>
              )}

              {!blocked && (
                <div className="flex gap-3">
                  {warning && (
                    <button
                      type="button"
                      onClick={() => setAiResult(null)}
                      className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      Edit Chapter
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={doPublish}
                    disabled={submitting}
                    className="flex-1 rounded-xl bg-primary text-primary-foreground font-semibold py-2.5 hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {submitting ? "Publishing..." : warning ? "Publish Anyway" : "Publish Chapter"}
                  </button>
                </div>
              )}

              {blocked && (
                <button
                  type="button"
                  onClick={() => setAiResult(null)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Edit Chapter
                </button>
              )}
            </div>
          );
        })()}

        {!aiResult && (
          <button
            type="submit"
            disabled={submitting || aiChecking || !title.trim() || !content.trim()}
            className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
          >
            {aiChecking && <Loader2 className="h-4 w-4 animate-spin" />}
            {aiChecking ? "Checking content…" : "Check & Publish Chapter"}
          </button>
        )}
      </form>
    </div>
  );
}
