import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { Heart, MessageSquare, BookOpen, ArrowLeft, Loader2, ChevronLeft, ChevronRight, Bookmark, BookmarkCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function StoryDetail() {
  const { id } = useParams();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [story, setStory] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [activeChapter, setActiveChapter] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [likes, setLikes] = useState({ count: 0, user_liked: false });
  const [favorited, setFavorited] = useState(false);
  const [progress, setProgress] = useState(0);
  const [comment, setComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [liking, setLiking] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    fetchAll();
  }, [id]);

  async function fetchAll() {
    try {
      const [s, chs, cmts] = await Promise.all([
        apiFetch(`/stories/${id}`),
        apiFetch(`/stories/${id}/chapters`),
        apiFetch(`/stories/${id}/comments`),
      ]);
      setStory(s);
      setLikes({ count: s.like_count || 0, user_liked: s.user_liked || false });
      setFavorited(s.user_favorited || false);
      setChapters(chs);
      if (chs.length > 0) setActiveChapter(chs[0]);
      setComments(cmts);
      if (isAuthenticated) {
        const prog = await apiFetch(`/stories/${id}/progress`).catch(() => ({ progress: 0 }));
        setProgress(prog.progress || 0);
      }
    } catch {
      setStory(null);
    } finally {
      setLoading(false);
    }
  }

  // Track scroll progress
  useEffect(() => {
    if (!isAuthenticated || !contentRef.current) return;
    const el = contentRef.current;
    const handleScroll = () => {
      const scrolled = el.scrollTop;
      const total = el.scrollHeight - el.clientHeight;
      if (total > 0) {
        const pct = Math.round((scrolled / total) * 100);
        setProgress(pct);
        apiFetch(`/stories/${id}/progress`, { method: "POST", body: JSON.stringify({ progress: pct }) }).catch(() => {});
      }
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [story, isAuthenticated]);

  async function handleLike() {
    if (!isAuthenticated) { navigate("/login"); return; }
    if (liking) return;
    setLiking(true);
    try {
      const res = await apiFetch(`/stories/${id}/like`, { method: "POST" });
      setLikes({ count: res.count, user_liked: res.liked });
    } finally {
      setLiking(false);
    }
  }

  async function handleFavorite() {
    if (!isAuthenticated) { navigate("/login"); return; }
    const res = await apiFetch(`/stories/${id}/favorite`, { method: "POST" });
    setFavorited(res.favorited);
  }

  async function handleComment(e) {
    e.preventDefault();
    if (!isAuthenticated) { navigate("/login"); return; }
    if (!comment.trim()) return;
    setSubmittingComment(true);
    try {
      const newComment = await apiFetch(`/stories/${id}/comments`, { method: "POST", body: JSON.stringify({ content: comment }) });
      setComments(prev => [...prev, newComment]);
      setComment("");
    } finally {
      setSubmittingComment(false);
    }
  }

  if (loading) return <div className="flex justify-center py-32"><Loader2 className="h-12 w-12 animate-spin text-primary/50" /></div>;
  if (!story) return (
    <div className="p-8 text-center">
      <p className="text-destructive text-lg">Story not found</p>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">Back to Home</Link>
    </div>
  );

  const chapterIdx = chapters.findIndex(c => c.id === activeChapter?.id);
  const content = activeChapter ? activeChapter.content : story.content;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      {/* Header */}
      <div className="mb-8">
        {story.cover_image_url && (
          <div className="rounded-2xl overflow-hidden mb-6 aspect-video">
            <img src={story.cover_image_url} alt={story.title} className="w-full h-full object-cover" />
          </div>
        )}
        <h1 className="font-serif text-4xl font-bold mb-2">{story.title}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
          <span>by {story.author_name || "Unknown"}</span>
          <span>•</span>
          <span>{story.created_at ? formatDistanceToNow(new Date(story.created_at)) + " ago" : ""}</span>
        </div>
        {story.description && <p className="text-muted-foreground italic text-base mb-4">{story.description}</p>}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            data-testid="like-btn"
            onClick={handleLike}
            disabled={liking}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-all ${likes.user_liked ? "bg-primary/10 border-primary text-primary" : "border-border hover:border-primary/40 hover:bg-primary/5"}`}
          >
            <Heart className={`h-4 w-4 ${likes.user_liked ? "fill-primary" : ""}`} />
            <span data-testid="like-count">{likes.count}</span>
          </button>
          <button
            data-testid="favorite-btn"
            onClick={handleFavorite}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-all ${favorited ? "bg-primary/10 border-primary text-primary" : "border-border hover:border-primary/40 hover:bg-primary/5"}`}
          >
            {favorited ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            {favorited ? "Saved" : "Save"}
          </button>
        </div>

        {/* Reading Progress */}
        {isAuthenticated && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Reading progress</span><span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Chapters Nav */}
      {chapters.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {chapters.map(ch => (
            <button
              key={ch.id}
              onClick={() => setActiveChapter(ch)}
              className={`text-sm rounded-lg px-3 py-1.5 border transition-colors ${activeChapter?.id === ch.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}
            >
              Ch. {ch.order_index + 1}: {ch.title}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div
        ref={contentRef}
        className="prose prose-lg max-w-none dark:prose-invert max-h-[60vh] overflow-y-auto pr-2 mb-8 rounded-xl bg-card border border-border p-6"
        style={{ scrollBehavior: "smooth" }}
      >
        {activeChapter && <h2 className="font-serif text-2xl font-bold mb-4">{activeChapter.title}</h2>}
        <p className="whitespace-pre-wrap text-foreground leading-relaxed">{content}</p>
      </div>

      {/* Chapter Navigation */}
      {chapters.length > 1 && (
        <div className="flex justify-between mb-10">
          <button
            onClick={() => setActiveChapter(chapters[chapterIdx - 1])}
            disabled={chapterIdx <= 0}
            className="flex items-center gap-1.5 text-sm rounded-lg border border-border px-4 py-2 hover:border-primary/40 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <button
            onClick={() => setActiveChapter(chapters[chapterIdx + 1])}
            disabled={chapterIdx >= chapters.length - 1}
            className="flex items-center gap-1.5 text-sm rounded-lg border border-border px-4 py-2 hover:border-primary/40 disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Comments */}
      <div className="border-t border-border pt-8">
        <h3 className="font-serif text-xl font-bold mb-5 flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> Comments ({comments.length})
        </h3>
        {isAuthenticated ? (
          <form onSubmit={handleComment} className="flex gap-2 mb-6">
            <input
              data-testid="comment-input"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Share your thoughts..."
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button type="submit" disabled={submittingComment || !comment.trim()} data-testid="comment-submit"
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
              Post
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground mb-4">
            <Link to="/login" className="text-primary hover:underline">Log in</Link> to leave a comment.
          </p>
        )}
        <div className="space-y-4">
          {comments.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {(c.author_name || "U")[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium">{c.author_name}</div>
                <p className="text-sm text-muted-foreground mt-0.5">{c.content}</p>
                {c.replies && c.replies.length > 0 && (
                  <div className="mt-2 space-y-2 pl-4 border-l-2 border-border">
                    {c.replies.map(r => (
                      <div key={r.id} className="flex gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                          {(r.author_name || "U")[0].toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{r.author_name}</span>
                          <p className="text-sm text-muted-foreground">{r.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {comments.length === 0 && <p className="text-muted-foreground text-sm text-center py-6">No comments yet. Be the first!</p>}
        </div>
      </div>
    </div>
  );
}
