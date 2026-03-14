import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import {
  BookOpen, Plus, Trash2, Loader2, ChevronDown, ChevronUp,
  Camera, X, Lock, AlertCircle, Bot, ShieldCheck, AlertTriangle, CheckCircle2
} from "lucide-react";

async function resizeImage(file, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const MAX = 1200;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      let q = 0.9, data = canvas.toDataURL("image/jpeg", q);
      while (data.length > maxBytes * 1.37 && q > 0.3) { q -= 0.1; data = canvas.toDataURL("image/jpeg", q); }
      resolve(data);
    };
    img.onerror = reject;
    img.src = url;
  });
}

const PRICE_OPTIONS = [10, 20, 30, 50, 75, 100];

function AiScoreGauge({ score }) {
  const color = score >= 70 ? "#ef4444" : score >= 40 ? "#f59e0b" : "#22c55e";
  const pct = Math.min(100, Math.max(0, score));
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={dashOffset}
          strokeLinecap="round" transform="rotate(-90 56 56)" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        <text x="56" y="60" textAnchor="middle" fontSize="22" fontWeight="700" fill={color}>{score}</text>
      </svg>
      <span className="text-xs text-muted-foreground font-medium">out of 100</span>
    </div>
  );
}

export default function Write() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverPreview, setCoverPreview] = useState(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [chapters, setChapters] = useState([{ title: "", content: "" }]);
  const [useChapters, setUseChapters] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState(null);
  const [expandedChapter, setExpandedChapter] = useState(0);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const [aiChecking, setAiChecking] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiConfirmed, setAiConfirmed] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated]);

  async function handleCoverChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageProcessing(true);
    try {
      const data = await resizeImage(file);
      setCoverPreview(data);
      setCoverImageUrl(data);
    } finally {
      setImageProcessing(false);
    }
  }

  async function doPublish() {
    setSubmitting(true);
    try {
      const story = await apiFetch("/stories", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          content: useChapters ? "" : content.trim(),
          cover_image_url: coverImageUrl,
          is_paid: isPaid,
          price: isPaid ? price : 0,
        }),
      });
      if (useChapters) {
        for (let i = 0; i < chapters.length; i++) {
          await apiFetch(`/stories/${story.id}/chapters`, {
            method: "POST",
            body: JSON.stringify({ title: chapters[i].title.trim(), content: chapters[i].content.trim(), order_index: i }),
          });
        }
      }
      setSuccessId(story.id);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!title.trim()) { setError("Please enter a story title."); return; }
    if (useChapters) {
      const bad = chapters.findIndex(c => !c.title.trim() || !c.content.trim());
      if (bad !== -1) { setExpandedChapter(bad); setError(`Chapter ${bad + 1} must have both a title and content.`); return; }
    } else if (!content.trim()) { setError("Please add some content to your story."); return; }
    if (isPaid && (!price || price <= 0)) { setError("Please set a valid price for your paid story."); return; }

    if (aiConfirmed) { doPublish(); return; }

    setAiChecking(true);
    setAiResult(null);
    try {
      const result = await apiFetch("/stories/check-ai", {
        method: "POST",
        body: JSON.stringify({
          content: useChapters ? "" : content,
          chapters: useChapters ? chapters : null,
        }),
      });
      setAiResult(result);
      if (result.verdict === "likely_human" || result.verdict === "too_short") {
        doPublish();
      }
    } catch {
      doPublish();
    } finally {
      setAiChecking(false);
    }
  }

  if (authLoading) return <div className="flex justify-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary/50" /></div>;
  if (!isAuthenticated) return null;

  if (successId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-serif text-2xl font-bold">Story Published!</h2>
        <p className="text-muted-foreground">Your story is now live.</p>
        <div className="flex gap-3">
          <button onClick={() => navigate(`/stories/${successId}`)} className="rounded-lg bg-primary text-primary-foreground px-5 py-2 font-medium hover:bg-primary/90">View Story</button>
          <button onClick={() => { setTitle(""); setDescription(""); setContent(""); setCoverImageUrl(""); setCoverPreview(null); setChapters([{ title: "", content: "" }]); setIsPaid(false); setPrice(20); setSuccessId(null); setError(""); setAiResult(null); setAiConfirmed(false); }}
            className="rounded-lg border border-border px-5 py-2 font-medium hover:bg-muted">Write Another</button>
        </div>
      </div>
    );
  }

  const showAiPanel = aiResult && (aiResult.verdict === "likely_ai" || aiResult.verdict === "possibly_ai");

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-serif text-4xl font-bold mb-8">Write a Story</h1>
      <form onSubmit={handleSubmit} noValidate className="space-y-6">

        {/* Cover Image */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Cover Image <span className="text-muted-foreground text-xs">(optional)</span></label>
          <div className="relative border-2 border-dashed border-border rounded-xl overflow-hidden cursor-pointer hover:bg-muted/20 transition-colors"
            style={{ aspectRatio: "16/7" }} onClick={() => fileRef.current?.click()}>
            {coverPreview ? (
              <>
                <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                {imageProcessing && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
                <button type="button" className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
                  onClick={e => { e.stopPropagation(); setCoverPreview(null); setCoverImageUrl(""); }}>
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-8">
                {imageProcessing ? <Loader2 className="h-8 w-8 animate-spin" /> : <><Camera className="h-8 w-8" /><span className="text-sm">Click to upload cover image</span></>}
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Story Title <span className="text-destructive">*</span></label>
          <input value={title} onChange={e => { setTitle(e.target.value); if (error) setError(""); }}
            placeholder="Enter an engaging title..."
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-lg font-serif focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description <span className="text-muted-foreground text-xs">(optional)</span></label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="A brief summary of your story..." rows={3}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>

        {/* Monetization */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">Paid Story</p>
                <p className="text-xs text-muted-foreground">Readers must pay to unlock. You keep 70%.</p>
              </div>
            </div>
            <button type="button" onClick={() => setIsPaid(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isPaid ? "bg-primary" : "bg-muted"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isPaid ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          {isPaid && (
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-sm font-medium">Story Price (ZAR)</label>
              <div className="flex flex-wrap gap-2">
                {PRICE_OPTIONS.map(p => (
                  <button key={p} type="button" onClick={() => setPrice(p)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold border transition-colors ${price === p ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                    R{p}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Custom:</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-muted-foreground">R</span>
                  <input type="number" min="5" max="999" value={price} onChange={e => setPrice(Number(e.target.value))}
                    className="w-24 rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">You will receive <strong>R{(price * 0.7).toFixed(2)}</strong> per sale (70%). Platform keeps R{(price * 0.3).toFixed(2)} (30%).</p>
            </div>
          )}
        </div>

        {/* Chapters toggle */}
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-muted/20">
          <input type="checkbox" id="use-chapters" checked={useChapters} onChange={e => { setUseChapters(e.target.checked); setError(""); }} className="rounded" />
          <label htmlFor="use-chapters" className="text-sm font-medium cursor-pointer">Organize into chapters</label>
        </div>

        {useChapters ? (
          <div className="space-y-3">
            {chapters.map((ch, i) => (
              <div key={i} className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-muted/20 cursor-pointer" onClick={() => setExpandedChapter(expandedChapter === i ? -1 : i)}>
                  <span className="text-sm font-semibold text-muted-foreground">Chapter {i + 1}</span>
                  <input value={ch.title} onChange={e => { const c = [...chapters]; c[i] = { ...c[i], title: e.target.value }; setChapters(c); if (error) setError(""); }}
                    placeholder={`Chapter ${i + 1} title`} onClick={e => e.stopPropagation()}
                    className="flex-1 bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground" />
                  <div className="flex items-center gap-1">
                    {chapters.length > 1 && (
                      <button type="button" onClick={e => { e.stopPropagation(); setChapters(chapters.filter((_, j) => j !== i)); if (expandedChapter >= chapters.length - 1) setExpandedChapter(chapters.length - 2); }} className="p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {expandedChapter === i ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
                {expandedChapter === i && (
                  <textarea value={ch.content} onChange={e => { const c = [...chapters]; c[i] = { ...c[i], content: e.target.value }; setChapters(c); if (error) setError(""); }}
                    placeholder="Write your chapter content here..." rows={10}
                    className="w-full border-t border-border bg-background px-4 py-3 text-sm focus:outline-none resize-none" />
                )}
              </div>
            ))}
            <button type="button" onClick={() => { setChapters([...chapters, { title: "", content: "" }]); setExpandedChapter(chapters.length); }}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium">
              <Plus className="h-4 w-4" /> Add Chapter
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Story Content <span className="text-destructive">*</span></label>
            <textarea value={content} onChange={e => { setContent(e.target.value); if (error) setError(""); if (aiResult) { setAiResult(null); setAiConfirmed(false); } }}
              placeholder="Start writing your story..." rows={16}
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* AI Detection Result Panel */}
        {showAiPanel && (
          <div className={`rounded-2xl border p-5 space-y-4 ${aiResult.verdict === "likely_ai" ? "border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"}`}>
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-2 shrink-0">
                {aiResult.verdict === "likely_ai"
                  ? <Bot className="h-8 w-8 text-red-500" />
                  : <AlertTriangle className="h-8 w-8 text-amber-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-bold text-base mb-1 ${aiResult.verdict === "likely_ai" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {aiResult.verdict === "likely_ai" ? "This content appears to be AI-generated" : "This content may contain AI-generated text"}
                </h3>
                <p className={`text-sm ${aiResult.verdict === "likely_ai" ? "text-red-600 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
                  {aiResult.verdict === "likely_ai"
                    ? "PRaww Reads is a platform for original human writing. Publishing AI-generated content may mislead readers."
                    : "We detected some patterns common in AI writing. You can still publish, but consider reviewing your content."}
                </p>
              </div>
              <AiScoreGauge score={aiResult.score} />
            </div>

            {aiResult.indicators?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Signals detected</p>
                <ul className="space-y-1">
                  {aiResult.indicators.map((ind, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${aiResult.verdict === "likely_ai" ? "bg-red-400" : "bg-amber-400"}`} />
                      {ind}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted-foreground italic">AI detection is not 100% accurate. If your content is genuinely your own, you can still publish it.</p>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { setAiResult(null); setAiConfirmed(false); }}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted transition-colors">
                Cancel — Edit My Story
              </button>
              <button type="button" onClick={() => { setAiConfirmed(true); doPublish(); }}
                disabled={submitting}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60
                  ${aiResult.verdict === "likely_ai" ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Publish Anyway
              </button>
            </div>
          </div>
        )}

        {/* Submit button — hidden when AI warning panel is showing */}
        {!showAiPanel && (
          <button type="submit" disabled={submitting || aiChecking}
            className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
            {(submitting || aiChecking) && <Loader2 className="h-4 w-4 animate-spin" />}
            {aiChecking ? "Checking content..." : submitting ? "Publishing..." : isPaid ? `Publish Paid Story (R${price})` : "Publish Story"}
          </button>
        )}
      </form>
    </div>
  );
}
