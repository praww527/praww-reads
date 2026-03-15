import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { Heart, MessageSquare, BookOpen, ArrowLeft, Loader2, ChevronLeft, ChevronRight, Bookmark, BookmarkCheck, Eye, Lock, Gift, Pencil, Trash2, Check, X, CreditCard } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const DONATION_AMOUNTS = [5, 10, 20, 50];

export default function StoryDetail() {
  const { id } = useParams();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
  const [purchased, setPurchased] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [donating, setDonating] = useState(false);
  const [donateSuccess, setDonateSuccess] = useState("");
  const [donateError, setDonateError] = useState("");
  const [purchaseSuccess, setPurchaseSuccess] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const [deletingStory, setDeletingStory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [commentLikes, setCommentLikes] = useState({});
  const [likingCommentId, setLikingCommentId] = useState(null);
  const [commentErrors, setCommentErrors] = useState({});

  const contentRef = useRef(null);

  useEffect(() => {
    fetchAll();
  }, [id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const payment = params.get("payment");
    const type = params.get("type");
    if (payment === "success") {
      if (type === "purchase") {
        setPurchased(true);
        setPurchaseSuccess("Payment successful! You now have full access to this story.");
      } else if (type === "donation") {
        setDonateSuccess("Thank you! Your donation has been received and the writer will be notified.");
      } else {
        setPaymentNotice("Payment successful!");
      }
      navigate(location.pathname, { replace: true });
    } else if (payment === "cancelled") {
      setPaymentNotice("Payment was cancelled. No charge was made.");
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);

  async function fetchAll() {
    try {
      const [s, chs, cmts] = await Promise.all([
        apiFetch(`/api/stories/${id}`),
        apiFetch(`/api/stories/${id}/chapters`),
        apiFetch(`/api/stories/${id}/comments`),
      ]);
      setStory(s);
      setLikes({ count: s.like_count || 0, user_liked: s.user_liked || false });
      setFavorited(s.user_favorited || false);
      setPurchased(s.user_purchased || false);
      setChapters(chs);
      if (chs.length > 0) setActiveChapter(chs[0]);
      setComments(cmts);
      const initialLikes = {};
      cmts.forEach(c => {
        initialLikes[c.id] = { count: c.like_count || 0, liked: c.user_liked || false };
        (c.replies || []).forEach(r => {
          initialLikes[r.id] = { count: r.like_count || 0, liked: r.user_liked || false };
        });
      });
      setCommentLikes(initialLikes);
      if (isAuthenticated) {
        const prog = await apiFetch(`/api/stories/${id}/progress`).catch(() => ({ progress: 0 }));
        setProgress(prog.progress || 0);
      }
    } catch {
      setStory(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !contentRef.current) return;
    const el = contentRef.current;
    const handleScroll = () => {
      const scrolled = el.scrollTop;
      const total = el.scrollHeight - el.clientHeight;
      if (total > 0) {
        const pct = Math.round((scrolled / total) * 100);
        setProgress(pct);
        apiFetch(`/api/stories/${id}/progress`, { method: "POST", body: JSON.stringify({ progress: pct }) }).catch(() => {});
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
      const res = await apiFetch(`/api/stories/${id}/like`, { method: "POST" });
      setLikes({ count: res.count, user_liked: res.liked });
    } finally {
      setLiking(false);
    }
  }

  async function handleFavorite() {
    if (!isAuthenticated) { navigate("/login"); return; }
    const res = await apiFetch(`/api/stories/${id}/favorite`, { method: "POST" });
    setFavorited(res.favorited);
  }

  async function handleComment(e) {
    e.preventDefault();
    if (!isAuthenticated) { navigate("/login"); return; }
    if (!comment.trim()) return;
    setSubmittingComment(true);
    try {
      const newComment = await apiFetch(`/api/stories/${id}/comments`, { method: "POST", body: JSON.stringify({ content: comment }) });
      setComments(prev => [...prev, newComment]);
      setCommentLikes(prev => ({ ...prev, [newComment.id]: { count: 0, liked: false } }));
      setComment("");
    } finally {
      setSubmittingComment(false);
    }
  }

  function _submitPayfast(payfastUrl, formData) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = payfastUrl;
    Object.entries(formData).forEach(([k, v]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = v;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  async function handleDonate(amount) {
    if (!isAuthenticated) { navigate("/register"); return; }
    setDonating(true);
    setDonateSuccess("");
    setDonateError("");
    try {
      const res = await apiFetch("/api/payfast/initiate-donation", {
        method: "POST",
        body: JSON.stringify({ story_id: id, amount }),
      });
      _submitPayfast(res.payfast_url, res.form_data);
    } catch (err) {
      setDonateError(err.message || "Failed to initiate donation. Please try again.");
      setDonating(false);
    }
  }

  async function handlePurchase() {
    if (!isAuthenticated) { navigate("/register"); return; }
    setPurchasing(true);
    setPurchaseError("");
    try {
      const res = await apiFetch("/api/payfast/initiate-purchase", {
        method: "POST",
        body: JSON.stringify({ story_id: id }),
      });
      _submitPayfast(res.payfast_url, res.form_data);
    } catch (err) {
      setPurchaseError(err.message || "Failed to initiate purchase. Please try again.");
      setPurchasing(false);
    }
  }

  async function handleDeleteStory() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeletingStory(true);
    setDeleteError("");
    try {
      await apiFetch(`/api/stories/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      setDeleteError(err.message || "Failed to delete story");
      setDeletingStory(false);
      setConfirmDelete(false);
    }
  }

  function startEditComment(c) {
    setEditingCommentId(c.id);
    setEditingCommentText(c.content);
  }

  async function saveEditComment(commentId) {
    if (!editingCommentText.trim()) return;
    setSavingComment(true);
    try {
      await apiFetch(`/api/stories/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ content: editingCommentText.trim() }),
      });
      setComments(prev => prev.map(c => {
        if (c.id === commentId) return { ...c, content: editingCommentText.trim() };
        return {
          ...c,
          replies: (c.replies || []).map(r => r.id === commentId ? { ...r, content: editingCommentText.trim() } : r),
        };
      }));
      setEditingCommentId(null);
      setEditingCommentText("");
    } catch (err) {
      setCommentErrors(prev => ({ ...prev, [commentId]: err.message || "Failed to edit comment" }));
    } finally {
      setSavingComment(false);
    }
  }

  async function handleDeleteComment(commentId) {
    setDeletingCommentId(commentId);
    try {
      await apiFetch(`/api/stories/comments/${commentId}`, { method: "DELETE" });
      setComments(prev =>
        prev
          .filter(c => c.id !== commentId)
          .map(c => ({ ...c, replies: (c.replies || []).filter(r => r.id !== commentId) }))
      );
    } catch (err) {
      setCommentErrors(prev => ({ ...prev, [commentId]: err.message || "Failed to delete comment" }));
    } finally {
      setDeletingCommentId(null);
    }
  }

  async function handleCommentLike(commentId) {
    if (!isAuthenticated) { navigate("/login"); return; }
    if (likingCommentId === commentId) return;
    setLikingCommentId(commentId);
    try {
      const res = await apiFetch(`/api/stories/comments/${commentId}/like`, { method: "POST" });
      setCommentLikes(prev => ({ ...prev, [commentId]: { count: res.count, liked: res.liked } }));
    } finally {
      setLikingCommentId(null);
    }
  }

  if (loading) return <div className="flex justify-center py-32"><Loader2 className="h-12 w-12 animate-spin text-primary/50" /></div>;
  if (!story) return (
    <div className="p-8 text-center">
      <p className="text-destructive text-lg">Story not found</p>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">Back to Home</Link>
    </div>
  );

  const isPaidStory = story.is_paid && story.price > 0;
  const isAuthor = isAuthenticated && user?.id === story.author_id;
  const canReadFull = !isPaidStory || purchased || isAuthor;
  const chapterIdx = chapters.findIndex(c => c.id === activeChapter?.id);
  const rawContent = activeChapter ? activeChapter.content : story.content;

  let displayContent = rawContent;
  let showGuestWall = false;
  let showPaidWall = false;

  if (!isAuthenticated) {
    showGuestWall = true;
    const preview = rawContent ? rawContent.slice(0, 600) : "";
    displayContent = preview + (rawContent && rawContent.length > 600 ? "..." : "");
  } else if (isPaidStory && !canReadFull) {
    showPaidWall = true;
    const preview = rawContent ? rawContent.slice(0, 400) : "";
    displayContent = preview + (rawContent && rawContent.length > 400 ? "..." : "");
  }

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
        <div className="flex items-start gap-3 mb-2">
          <h1 className="font-serif text-4xl font-bold flex-1">{story.title}</h1>
          {isPaidStory && (
            <span className="shrink-0 mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 text-sm font-semibold border border-amber-200 dark:border-amber-800">
              <Lock className="h-3.5 w-3.5" /> R{story.price}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            {story.author_profile_image_url ? (
              <img src={story.author_profile_image_url} alt={story.author_name} className="w-6 h-6 rounded-full object-cover border border-border" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs border border-border">
                {(story.author_name || "U")[0].toUpperCase()}
              </div>
            )}
            <Link to={`/profile/${story.author_id}`} className="hover:text-primary transition-colors">by {story.author_name || "Unknown"}</Link>
          </div>
          <span>•</span>
          <span>{story.created_at ? formatDistanceToNow(new Date(story.created_at)) + " ago" : ""}</span>
          <span>•</span>
          <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{story.view_count || 0} views</span>
        </div>
        {story.description && <p className="text-muted-foreground italic text-base mb-4">{story.description}</p>}

        {/* Author actions */}
        {isAuthor && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-muted/30 border border-border">
            <span className="text-xs text-muted-foreground font-medium mr-1">Your story:</span>
            <Link
              to={`/stories/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
            {confirmDelete ? (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-destructive font-medium">Delete this story?</span>
                <button
                  onClick={handleDeleteStory}
                  disabled={deletingStory}
                  className="inline-flex items-center gap-1 rounded-lg bg-destructive text-destructive-foreground px-3 py-1.5 text-sm font-medium hover:bg-destructive/90 disabled:opacity-60"
                >
                  {deletingStory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Yes, delete
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={handleDeleteStory}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 text-destructive bg-background px-3 py-1.5 text-sm font-medium hover:bg-destructive/10 transition-colors ml-auto"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            data-testid="like-btn"
            onClick={handleLike}
            disabled={liking || !isAuthenticated}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-all ${likes.user_liked ? "bg-primary/10 border-primary text-primary" : "border-border hover:border-primary/40 hover:bg-primary/5"} disabled:opacity-60`}
          >
            <Heart className={`h-4 w-4 ${likes.user_liked ? "fill-primary" : ""}`} />
            <span data-testid="like-count">{likes.count}</span>
          </button>
          {isAuthenticated && (
            <button
              data-testid="favorite-btn"
              onClick={handleFavorite}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-all ${favorited ? "bg-primary/10 border-primary text-primary" : "border-border hover:border-primary/40 hover:bg-primary/5"}`}
            >
              {favorited ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              {favorited ? "Saved" : "Save"}
            </button>
          )}
        </div>

        {/* Reading Progress */}
        {isAuthenticated && canReadFull && (
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
      {canReadFull && chapters.length > 1 && (
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
        ref={canReadFull && isAuthenticated ? contentRef : null}
        className="prose prose-lg max-w-none dark:prose-invert max-h-[60vh] overflow-y-auto pr-2 mb-8 rounded-xl bg-card border border-border p-6"
        style={{ scrollBehavior: "smooth" }}
      >
        {activeChapter && canReadFull && <h2 className="font-serif text-2xl font-bold mb-4">{activeChapter.title}</h2>}
        <p className="whitespace-pre-wrap text-foreground leading-relaxed">{displayContent}</p>
      </div>

      {/* Guest wall */}
      {showGuestWall && (
        <div className="mb-10 rounded-2xl border-2 border-primary/30 bg-primary/5 p-8 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-primary mb-3" />
          <h3 className="font-serif text-xl font-bold mb-2">Create a free account to continue reading</h3>
          <p className="text-muted-foreground mb-6 text-sm">Join PRaww Reads to read full stories, follow writers, donate, and more — completely free.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-8 py-3 hover:bg-primary/90 transition-colors">
              Sign Up to Continue Reading
            </Link>
            <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background font-semibold px-8 py-3 hover:bg-muted transition-colors">
              Log In
            </Link>
          </div>
        </div>
      )}

      {/* Paid story wall */}
      {showPaidWall && !showGuestWall && (
        <div className="mb-10 rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-8 text-center">
          <Lock className="h-12 w-12 mx-auto text-amber-500 mb-3" />
          <h3 className="font-serif text-xl font-bold mb-2">Unlock this story for R{story.price}</h3>
          <p className="text-muted-foreground mb-6 text-sm">This is a paid story. Purchase it once and read it forever. The writer receives 70% of every purchase.</p>
          {purchaseSuccess ? (
            <div className="rounded-xl bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-5 py-3 text-sm">
              {purchaseSuccess}
            </div>
          ) : (
            <button onClick={handlePurchase} disabled={purchasing}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-3 transition-colors disabled:opacity-60">
              {purchasing && <Loader2 className="h-4 w-4 animate-spin" />}
              {purchasing ? "Processing..." : `Unlock Story — R${story.price}`}
            </button>
          )}
        </div>
      )}

      {/* Chapter Navigation */}
      {canReadFull && chapters.length > 1 && (
        <div className="flex justify-between mb-10">
          <button onClick={() => setActiveChapter(chapters[chapterIdx - 1])} disabled={chapterIdx <= 0}
            className="flex items-center gap-1.5 text-sm rounded-lg border border-border px-4 py-2 hover:border-primary/40 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <button onClick={() => setActiveChapter(chapters[chapterIdx + 1])} disabled={chapterIdx >= chapters.length - 1}
            className="flex items-center gap-1.5 text-sm rounded-lg border border-border px-4 py-2 hover:border-primary/40 disabled:opacity-40">
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Donation Section — free stories */}
      {isAuthenticated && !isPaidStory && !isAuthor && (
        <div className="mb-10 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="h-5 w-5 text-primary" />
            <h3 className="font-serif text-lg font-bold">Support the Writer</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">If you enjoyed this story, consider donating to support <strong>{story.author_name}</strong>. The writer receives 70% of every donation.</p>
          {donateSuccess ? (
            <div className="rounded-xl bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-5 py-3 text-sm">{donateSuccess}</div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {DONATION_AMOUNTS.map(amount => (
                <button key={amount} onClick={() => handleDonate(amount)} disabled={donating}
                  className="rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-semibold px-5 py-2.5 text-sm transition-colors disabled:opacity-60">
                  {donating ? <Loader2 className="h-4 w-4 animate-spin inline" /> : `R${amount}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Donation Section — paid + purchased */}
      {isAuthenticated && isPaidStory && purchased && !isAuthor && (
        <div className="mb-10 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="h-5 w-5 text-primary" />
            <h3 className="font-serif text-lg font-bold">Loved it? Support the Writer</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Show some extra love to <strong>{story.author_name}</strong> with a donation.</p>
          {donateSuccess ? (
            <div className="rounded-xl bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-5 py-3 text-sm">{donateSuccess}</div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {DONATION_AMOUNTS.map(amount => (
                <button key={amount} onClick={() => handleDonate(amount)} disabled={donating}
                  className="rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-semibold px-5 py-2.5 text-sm transition-colors disabled:opacity-60">
                  {donating ? <Loader2 className="h-4 w-4 animate-spin inline" /> : `R${amount}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Comments */}
      {(isAuthenticated || !showGuestWall) && (
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
              <CommentItem
                key={c.id}
                comment={c}
                user={user}
                isAuthenticated={isAuthenticated}
                commentLikes={commentLikes}
                editingCommentId={editingCommentId}
                editingCommentText={editingCommentText}
                savingComment={savingComment}
                deletingCommentId={deletingCommentId}
                likingCommentId={likingCommentId}
                onEdit={startEditComment}
                onEditChange={setEditingCommentText}
                onEditSave={saveEditComment}
                onEditCancel={() => { setEditingCommentId(null); setEditingCommentText(""); }}
                onDelete={handleDeleteComment}
                onLike={handleCommentLike}
              />
            ))}
            {comments.length === 0 && <p className="text-muted-foreground text-sm text-center py-6">No comments yet. Be the first!</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function CommentItem({ comment: c, user, isAuthenticated, commentLikes, editingCommentId, editingCommentText, savingComment, deletingCommentId, likingCommentId, onEdit, onEditChange, onEditSave, onEditCancel, onDelete, onLike, isReply = false }) {
  const isOwn = isAuthenticated && user?.id === c.author_id;
  const cl = commentLikes[c.id] || { count: 0, liked: false };
  const isEditing = editingCommentId === c.id;
  const isDeleting = deletingCommentId === c.id;

  return (
    <div className={`flex gap-3 ${isReply ? "" : ""}`}>
      {c.author_profile_image_url ? (
        <img src={c.author_profile_image_url} alt={c.author_name} className={`${isReply ? "w-6 h-6" : "w-8 h-8"} rounded-full object-cover border border-border shrink-0`} />
      ) : (
        <div className={`${isReply ? "w-6 h-6 text-xs" : "w-8 h-8 text-xs"} rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0 border border-border`}>
          {(c.author_name || "U")[0].toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{c.author_name}</div>
        {isEditing ? (
          <div className="mt-1 flex gap-2 items-start">
            <textarea
              value={editingCommentText}
              onChange={e => onEditChange(e.target.value)}
              rows={2}
              className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              autoFocus
            />
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={() => onEditSave(c.id)} disabled={savingComment || !editingCommentText.trim()}
                className="rounded-lg bg-primary text-primary-foreground px-2 py-1 text-xs font-medium disabled:opacity-60 flex items-center gap-1">
                {savingComment ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
              </button>
              <button onClick={onEditCancel} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted flex items-center gap-1">
                <X className="h-3 w-3" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-0.5 break-words">{c.content}</p>
        )}
        {/* Comment actions */}
        {!isEditing && (
          <div className="flex items-center gap-3 mt-1.5">
            <button
              onClick={() => onLike(c.id)}
              disabled={!isAuthenticated || likingCommentId === c.id}
              className={`flex items-center gap-1 text-xs transition-colors disabled:opacity-50 ${cl.liked ? "text-primary font-medium" : "text-muted-foreground hover:text-primary"}`}
            >
              <Heart className={`h-3 w-3 ${cl.liked ? "fill-primary" : ""}`} />
              {cl.count > 0 && <span>{cl.count}</span>}
            </button>
            {isOwn && (
              <>
                <button onClick={() => onEdit(c)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button onClick={() => onDelete(c.id)} disabled={isDeleting}
                  className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors disabled:opacity-50">
                  {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
                </button>
              </>
            )}
          </div>
        )}
        {/* Replies */}
        {c.replies && c.replies.length > 0 && (
          <div className="mt-3 space-y-3 pl-4 border-l-2 border-border">
            {c.replies.map(r => (
              <CommentItem
                key={r.id}
                comment={r}
                user={user}
                isAuthenticated={isAuthenticated}
                commentLikes={commentLikes}
                editingCommentId={editingCommentId}
                editingCommentText={editingCommentText}
                savingComment={savingComment}
                deletingCommentId={deletingCommentId}
                likingCommentId={likingCommentId}
                onEdit={onEdit}
                onEditChange={onEditChange}
                onEditSave={onEditSave}
                onEditCancel={onEditCancel}
                onDelete={onDelete}
                onLike={onLike}
                isReply={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
