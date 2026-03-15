import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { BookOpen, Plus, Trash2, Loader2, ChevronDown, ChevronUp, Camera, X, Lock, AlertCircle, ArrowLeft, Save, Bot, AlertTriangle, CheckCircle2 } from "lucide-react";

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
  const color = score >= 80 ? "#ef4444" : score >= 40 ? "#f59e0b" : "#22c55e";
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

export default function EditStory() {
  const { id } = useParams();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverPreview, setCoverPreview] = useState(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [deletedChapterIds, setDeletedChapterIds] = useState([]);
  const [useChapters, setUseChapters] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  const [expandedChapter, setExpandedChapter] = useState(0);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [aiChecking, setAiChecking] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) fetchStory();
  }, [id, authLoading, isAuthenticated]);

  async function fetchStory() {
    try {
      const [s, chs] = await Promise.all([
        apiFetch(`/api/stories/${id}`),
        apiFetch(`/api/stories/${id}/chapters`),
      ]);
      if (s.author_id !== user?.id) {
        navigate(`/stories/${id}`);
        return;
      }
      setTitle(s.title || "");
      setDescription(s.description || "");
      setContent(s.content || "");
      setCoverImageUrl(s.cover_image_url || "");
      setCoverPreview(s.cover_image_url || null);
      setIsPaid(s.is_paid || false);
      setPrice(s.price || 20);
      if (chs.length > 0) {
        setUseChapters(true);
        setChapters(chs.map(c => ({ id: c.id, title: c.title, content: c.content, order_index: c.order_index, isNew: false })));
      } else {
        setUseChapters(false);
        setChapters([]);
      }
    } catch {
      navigate("/");
    } finally {
      setLoading(false);
    }
  }

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

  function addChapter() {
    setChapters(prev => [...prev, { id: null, title: "", content: "", order_index: prev.length, isNew: true }]);
    setExpandedChapter(chapters.length);
  }

  function removeChapter(i) {
    const ch = chapters[i];
    if (ch.id) setDeletedChapterIds(prev => [...prev, ch.id]);
    setChapters(prev => prev.filter((_, j) => j !== i));
    if (expandedChapter >= chapters.length - 1) setExpandedChapter(chapters.length - 2);
  }

  async function doSave() {
    setSubmitting(true);
    try {
      await apiFetch(`/api/stories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          content: useChapters ? "" : content.trim(),
          cover_image_url: coverImageUrl,
          is_paid: isPaid,
          price: isPaid ? price : 0,
        }),
      });

      for (const chapId of deletedChapterIds) {
        await apiFetch(`/api/chapters/${chapId}`, { method: "DELETE" }).catch(() => {});
      }

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (ch.isNew) {
          await apiFetch(`/api/stories/${id}/chapters`, {
            method: "POST",
            body: JSON.stringify({ title: ch.title.trim(), content: ch.content.trim(), order_index: i }),
          });
        } else if (ch.id) {
          await apiFetch(`/api/chapters/${ch.id}`, {
            method: "PATCH",
            body: JSON.stringify({ title: ch.title.trim(), content: ch.content.trim(), order_index: i }),
          });
        }
      }

      setDeletedChapterIds([]);
      setChapters(prev => prev.map(c => ({ ...c, isNew: false })));
      setSaved(true);
      setTimeout(() => navigate(`/stories/${id}`), 1000);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);

    if (!title.trim()) { setError("Please enter a story title."); return; }
    if (useChapters) {
      const bad = chapters.findIndex(c => !c.title.trim() || !c.content.trim());
      if (bad !== -1) { setExpandedChapter(bad); setError(`Chapter ${bad + 1} must have both a title and content.`); return; }
      if (chapters.length === 0) { setError("Add at least one chapter."); return; }
    } else if (!content.trim()) {
      setError("Please add some content to your story."); return;
    }
    if (isPaid && (!price || price <= 0)) { setError("Please set a valid price."); return; }

    const aiContent = useChapters
      ? chapters.map(c => c.content).join("\n\n")
      : content;

    setAiChecking(true);
    setAiResult(null);
    try {
      const result = await apiFetch("/stories/check-ai", {
        method: "POST",
        body: JSON.stringify({ content: aiContent, chapters: null }),
      });
      setAiResult(result);
      // Always show the panel so the author sees their score — never auto-save
    } catch (err) {
      setError("Content check failed (" + (err.message || "server error") + "). Please try again.");
    } finally {
      setAiChecking(false);
    }
  }

  if (authLoading || loading) return <div className="flex justify-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary/50" /></div>;
  if (!isAuthenticated) return null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10">
      <Link to={`/stories/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Story
      </Link>
      <h1 className="font-serif text-4xl font-bold mb-8">Edit Story</h1>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">

        {/* Cover Image */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Cover Image <span className="text-muted-foreground text-xs">(optional)</span></label>
          <div
            className="relative border-2 border-dashed border-border rounded-xl overflow-hidden cursor-pointer hover:bg-muted/20 transition-colors"
            style={{ aspectRatio: "16/7" }}
            onClick={() => fileRef.current?.click()}
          >
            {coverPreview ? (
              <>
                <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                {imageProcessing && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
                <button type="button"
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
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

        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Story Title <span className="text-destructive">*</span></label>
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); if (error) setError(""); }}
            placeholder="Enter an engaging title..."
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-lg font-serif focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Description */}
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
            <button
              type="button"
              onClick={() => setIsPaid(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isPaid ? "bg-primary" : "bg-muted"}`}
            >
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
                  <input type="number" min="5" max="9999" value={price} onChange={e => setPrice(Number(e.target.value))}
                    className="w-24 rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">You will receive <strong>R{(price * 0.7).toFixed(2)}</strong> per sale (70%).</p>
            </div>
          )}
        </div>

        {/* Chapters toggle */}
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-muted/20">
          <input type="checkbox" id="use-chapters" checked={useChapters}
            onChange={e => { setUseChapters(e.target.checked); setError(""); if (e.target.checked && chapters.length === 0) setChapters([{ id: null, title: "", content: "", order_index: 0, isNew: true }]); }}
            className="rounded" />
          <label htmlFor="use-chapters" className="text-sm font-medium cursor-pointer">Organize into chapters</label>
        </div>

        {useChapters ? (
          <div className="space-y-3">
            {chapters.map((ch, i) => (
              <div key={ch.id || `new-${i}`} className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-muted/20 cursor-pointer" onClick={() => setExpandedChapter(expandedChapter === i ? -1 : i)}>
                  <span className="text-sm font-semibold text-muted-foreground">Chapter {i + 1}</span>
                  <input value={ch.title}
                    onChange={e => { const c = [...chapters]; c[i] = { ...c[i], title: e.target.value }; setChapters(c); if (error) setError(""); }}
                    placeholder={`Chapter ${i + 1} title`} onClick={e => e.stopPropagation()}
                    className="flex-1 bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground" />
                  <div className="flex items-center gap-1">
                    {chapters.length > 1 && (
                      <button type="button" onClick={e => { e.stopPropagation(); removeChapter(i); }} className="p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {expandedChapter === i ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
                {expandedChapter === i && (
                  <textarea value={ch.content}
                    onChange={e => { const c = [...chapters]; c[i] = { ...c[i], content: e.target.value }; setChapters(c); if (error) setError(""); }}
                    placeholder="Write your chapter content here..." rows={10}
                    className="w-full border-t border-border bg-background px-4 py-3 text-sm focus:outline-none resize-none" />
                )}
              </div>
            ))}
            <button type="button" onClick={addChapter}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium">
              <Plus className="h-4 w-4" /> Add Chapter
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Story Content <span className="text-destructive">*</span></label>
            <textarea value={content}
              onChange={e => { setContent(e.target.value); if (error) setError(""); }}
              placeholder="Start writing your story..." rows={16}
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {saved && (
          <div className="flex items-center gap-2 rounded-xl bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 text-sm">
            <BookOpen className="h-4 w-4 shrink-0" />
            Story saved! Redirecting...
          </div>
        )}

        {/* AI Detection Result Panel — always shown after verification */}
        {aiResult && (() => {
          const isHardBlock = aiResult.score >= 80;
          const isWarning = aiResult.score >= 40 && aiResult.score < 80;
          return (
            <div className={`rounded-2xl border p-5 space-y-4 ${
              isHardBlock ? "border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800"
              : isWarning ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"
              : "border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-800"
            }`}>
              <div className="flex items-start gap-4">
                <div className="shrink-0">
                  {isHardBlock
                    ? <Bot className="h-8 w-8 text-red-500" />
                    : isWarning
                    ? <AlertTriangle className="h-8 w-8 text-amber-500" />
                    : <CheckCircle2 className="h-8 w-8 text-green-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold text-base mb-1 ${
                    isHardBlock ? "text-red-700 dark:text-red-400"
                    : isWarning ? "text-amber-700 dark:text-amber-400"
                    : "text-green-700 dark:text-green-400"
                  }`}>
                    {isHardBlock
                      ? "Save rejected — AI-generated content detected"
                      : isWarning
                      ? "Possible AI patterns detected"
                      : aiResult.verdict === "too_short"
                      ? "Content verified — too short to fully analyse"
                      : "Content verified — looks human-written"}
                  </h3>
                  <p className={`text-sm ${
                    isHardBlock ? "text-red-600 dark:text-red-300"
                    : isWarning ? "text-amber-700 dark:text-amber-300"
                    : "text-green-700 dark:text-green-300"
                  }`}>
                    {isHardBlock
                      ? `Your content scored ${aiResult.score}/100 on our AI detector and cannot be saved. PRaww Reads only allows original human writing.`
                      : isWarning
                      ? `Your content scored ${aiResult.score}/100. Some AI writing patterns were detected. You may still save, but consider reviewing your content.`
                      : aiResult.verdict === "too_short"
                      ? "Your content is too short to fully analyse. You're good to go!"
                      : `Your content scored ${aiResult.score}/100. It reads as original, human writing. You're good to save!`}
                  </p>
                </div>
                {aiResult.verdict !== "too_short" && <AiScoreGauge score={aiResult.score} />}
              </div>

              {aiResult.indicators?.length > 0 && aiResult.score >= 40 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Signals detected</p>
                  <ul className="space-y-1">
                    {aiResult.indicators.map((ind, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isHardBlock ? "bg-red-400" : "bg-amber-400"}`} />
                        {ind}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isHardBlock ? (
                <>
                  <p className="text-xs text-muted-foreground italic">If you believe this is a mistake, please rewrite your content in your own voice and try again.</p>
                  <button type="button" onClick={() => setAiResult(null)}
                    className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted transition-colors">
                    Go Back &amp; Edit My Story
                  </button>
                </>
              ) : (
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setAiResult(null)}
                    className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted transition-colors">
                    Edit My Story
                  </button>
                  <button type="button" onClick={() => doSave()} disabled={submitting}
                    className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60 ${
                      isWarning ? "bg-amber-500 hover:bg-amber-600" : "bg-green-600 hover:bg-green-700"
                    }`}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isWarning ? "Save Anyway" : "Save Changes"}
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {!aiResult && (
        <div className="flex gap-3">
          <button type="submit" disabled={submitting || aiChecking}
            className="flex-1 rounded-xl bg-primary text-primary-foreground font-semibold py-3 hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
            {aiChecking
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking content...</>
              : submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              : <><Save className="h-4 w-4" /> Save Changes</>}
          </button>
          <Link to={`/stories/${id}`}
            className="rounded-xl border border-border px-6 py-3 font-semibold hover:bg-muted transition-colors text-center">
            Cancel
          </Link>
        </div>
        )}
      </form>
    </div>
  );
}
