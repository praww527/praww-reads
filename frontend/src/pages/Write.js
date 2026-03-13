import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { BookOpen, Plus, Trash2, Loader2, ChevronDown, ChevronUp, Camera, X } from "lucide-react";

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
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState(null);
  const [expandedChapter, setExpandedChapter] = useState(0);
  const fileRef = useRef(null);

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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    if (useChapters && chapters.some(c => !c.title.trim() || !c.content.trim())) {
      alert("All chapters must have a title and content.");
      return;
    }
    if (!useChapters && !content.trim()) {
      alert("Please add some content to your story.");
      return;
    }
    setSubmitting(true);
    try {
      const story = await apiFetch("/stories", {
        method: "POST",
        body: JSON.stringify({ title, description, content: useChapters ? chapters[0]?.content || "" : content, cover_image_url: coverImageUrl }),
      });
      if (useChapters) {
        for (let i = 0; i < chapters.length; i++) {
          await apiFetch(`/stories/${story.id}/chapters`, {
            method: "POST",
            body: JSON.stringify({ title: chapters[i].title, content: chapters[i].content, order_index: i }),
          });
        }
      }
      setSuccessId(story.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
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
          <button onClick={() => { setTitle(""); setDescription(""); setContent(""); setCoverImageUrl(""); setCoverPreview(null); setChapters([{ title: "", content: "" }]); setSuccessId(null); }}
            className="rounded-lg border border-border px-5 py-2 font-medium hover:bg-muted">Write Another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-serif text-4xl font-bold mb-8">Write a Story</h1>
      <form onSubmit={handleSubmit} className="space-y-6">

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
          <label className="text-sm font-medium">Story Title *</label>
          <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter an engaging title..."
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-lg font-serif focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description <span className="text-muted-foreground text-xs">(optional)</span></label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="A brief summary of your story..." rows={3}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>

        {/* Chapters toggle */}
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-muted/20">
          <input type="checkbox" id="use-chapters" checked={useChapters} onChange={e => setUseChapters(e.target.checked)} className="rounded" />
          <label htmlFor="use-chapters" className="text-sm font-medium cursor-pointer">Organize into chapters</label>
        </div>

        {useChapters ? (
          <div className="space-y-3">
            {chapters.map((ch, i) => (
              <div key={i} className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-muted/20 cursor-pointer" onClick={() => setExpandedChapter(expandedChapter === i ? -1 : i)}>
                  <span className="text-sm font-semibold text-muted-foreground">Chapter {i + 1}</span>
                  <input value={ch.title} onChange={e => { const c = [...chapters]; c[i] = { ...c[i], title: e.target.value }; setChapters(c); }}
                    placeholder={`Chapter ${i + 1} title`} onClick={e => e.stopPropagation()}
                    className="flex-1 bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground" />
                  <div className="flex items-center gap-1">
                    {chapters.length > 1 && (
                      <button type="button" onClick={e => { e.stopPropagation(); setChapters(chapters.filter((_, j) => j !== i)); }} className="p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {expandedChapter === i ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
                {expandedChapter === i && (
                  <textarea value={ch.content} onChange={e => { const c = [...chapters]; c[i] = { ...c[i], content: e.target.value }; setChapters(c); }}
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
            <label className="text-sm font-medium">Story Content *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Start writing your story..." rows={16}
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed" />
          </div>
        )}

        <button type="submit" disabled={submitting} data-testid="publish-story-btn"
          className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Publishing..." : "Publish Story"}
        </button>
      </form>
    </div>
  );
}
