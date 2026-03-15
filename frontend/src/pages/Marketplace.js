import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { BookText, Tag, ArrowLeftRight, Loader2, Camera, X, Edit2, Trash2, MessageCircle, CheckCircle, ShoppingBag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const CONDITION_LABELS = {
  new:  { label: "New",  color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  good: { label: "Good", color: "bg-blue-100 text-blue-700 border-blue-200" },
  fair: { label: "Fair", color: "bg-amber-100 text-amber-700 border-amber-200" },
};

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

export default function Marketplace() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  const fileRef = useRef(null);

  const [form, setForm] = useState({ title: "", author: "", price: "", condition: "good", allow_swap: false, swap_for: "", image_url: "" });
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [soldError, setSoldError] = useState("");

  useEffect(() => { fetchBooks(); }, []);

  async function fetchBooks() {
    try {
      const data = await apiFetch("/books");
      setBooks(data);
    } catch {
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    if (!isAuthenticated) { navigate("/login"); return; }
    setEditingBook(null);
    setForm({ title: "", author: "", price: "", condition: "good", allow_swap: false, swap_for: "", image_url: "" });
    setImagePreview(null);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(book) {
    setEditingBook(book);
    setForm({ title: book.title, author: book.author || "", price: String(book.price), condition: book.condition, allow_swap: book.allow_swap, swap_for: book.swap_for || "", image_url: book.image_url || "" });
    setImagePreview(book.image_url || null);
    setFormError("");
    setShowForm(true);
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageProcessing(true);
    try {
      const data = await resizeImage(file);
      setImagePreview(data);
      setForm(f => ({ ...f, image_url: data }));
    } finally {
      setImageProcessing(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    const body = { ...form, price: parseFloat(form.price) };
    try {
      if (editingBook) {
        const updated = await apiFetch(`/api/books/${editingBook.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setBooks(bs => bs.map(b => b.id === updated.id ? updated : b));
      } else {
        const created = await apiFetch("/books", { method: "POST", body: JSON.stringify(body) });
        setBooks(bs => [created, ...bs]);
      }
      setShowForm(false);
    } catch (err) {
      setFormError(err.message || "Something went wrong. Please try again.");
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    setDeleteError("");
    try {
      await apiFetch(`/api/books/${deletingId}`, { method: "DELETE" });
      setBooks(bs => bs.filter(b => b.id !== deletingId));
      setDeletingId(null);
    } catch (err) {
      setDeleteError(err.message || "Failed to delete. Please try again.");
    }
  }

  async function handleMarkSold(book) {
    setSoldError("");
    try {
      const updated = await apiFetch(`/api/books/${book.id}/sold`, { method: "POST" });
      setBooks(bs => bs.map(b => b.id === updated.id ? updated : b));
    } catch (err) {
      setSoldError(err.message || "Failed to update listing. Please try again.");
      setTimeout(() => setSoldError(""), 4000);
    }
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-7 w-7 text-primary" />
          <div>
            <h1 className="font-serif text-3xl font-bold leading-tight">Marketplace</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Buy, sell &amp; swap books in the community</p>
          </div>
          {books.length > 0 && (
            <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
              {books.length}
            </span>
          )}
        </div>
        <button
          data-testid="sell-book-btn"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground font-semibold px-4 py-2.5 text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 transition-colors"
        >
          <Tag className="h-4 w-4" /> Sell
        </button>
      </div>

      {/* Book List — styled like group messages */}
      {loading ? (
        <div className="flex justify-center py-32"><Loader2 className="h-12 w-12 animate-spin text-primary/50" /></div>
      ) : books.length === 0 ? (
        <div className="text-center py-32 border-2 border-dashed border-border rounded-3xl bg-muted/10">
          <BookText className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-serif text-2xl font-semibold">Marketplace is empty</h3>
          <p className="text-muted-foreground mt-2">Be the first to list a book.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {books.map(book => {
            const cond = CONDITION_LABELS[book.condition] || CONDITION_LABELS.good;
            const isMine = user?.id === book.seller_id;
            const sellerName = book.seller_name || "Seller";

            return (
              <div key={book.id} className="glass-row relative">
                {book.is_sold && (
                  <div className="absolute top-3 right-3 z-10 bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">SOLD</div>
                )}

                <Link to={`/books/${book.id}`} className="flex items-center gap-4 p-4">
                  {/* Book cover avatar */}
                  <div className="relative shrink-0">
                    {book.image_url ? (
                      <img
                        src={book.image_url}
                        alt={book.title}
                        className="w-14 h-14 rounded-2xl object-cover border border-white/60 shadow-sm"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-white/60 shadow-sm">
                        <BookText className="h-6 w-6 text-primary/60" />
                      </div>
                    )}
                    {book.allow_swap && (
                      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                        <ArrowLeftRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm leading-tight line-clamp-1">{book.title}</span>
                      <span className="text-base font-bold text-primary shrink-0">R{book.price}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {book.author && (
                        <span className="text-xs text-muted-foreground truncate">by {book.author}</span>
                      )}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cond.color}`}>{cond.label}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground border border-border/50 shrink-0">
                          {sellerName[0]?.toUpperCase()}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{sellerName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {book.created_at ? formatDistanceToNow(new Date(book.created_at)) + " ago" : ""}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Actions */}
                {isMine && (
                  <div className="flex gap-2 px-4 pb-3 pt-0">
                    <button
                      onClick={() => openEdit(book)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-border/60 rounded-xl px-3 py-2 hover:bg-white/40 transition-colors font-medium"
                    >
                      <Edit2 className="h-3 w-3" /> Edit
                    </button>
                    <button
                      onClick={() => handleMarkSold(book)}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs border rounded-xl px-3 py-2 transition-colors font-medium ${
                        book.is_sold
                          ? "border-emerald-300 text-emerald-700 bg-emerald-50/60"
                          : "border-border/60 hover:border-emerald-300 hover:bg-white/40"
                      }`}
                    >
                      <CheckCircle className="h-3 w-3" /> {book.is_sold ? "Unsell" : "Mark Sold"}
                    </button>
                    <button
                      onClick={() => setDeletingId(book.id)}
                      className="flex items-center justify-center text-xs border border-border/60 rounded-xl px-3 py-2 text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* List a Book Form Dialog */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg glass-panel max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-serif text-2xl font-bold">{editingBook ? "Edit Book" : "List a Book"}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Book Photo <span className="text-muted-foreground text-xs">(optional)</span></label>
                <div
                  className="relative border-2 border-dashed border-border rounded-2xl overflow-hidden bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                  style={{ aspectRatio: "4/3" }}
                  onClick={() => fileRef.current?.click()}
                >
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      {imageProcessing && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-white" />
                        </div>
                      )}
                      <button
                        type="button"
                        className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                        onClick={e => { e.stopPropagation(); setImagePreview(null); setForm(f => ({ ...f, image_url: "" })); }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-8">
                      {imageProcessing
                        ? <Loader2 className="h-8 w-8 animate-spin" />
                        : <><Camera className="h-8 w-8" /><span className="text-sm">Click to upload (max 2MB)</span></>
                      }
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Book Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Introduction to Algorithms"
                  className="w-full rounded-xl border border-input bg-white/50 backdrop-blur-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Author <span className="text-muted-foreground text-xs">(optional)</span></label>
                <input
                  value={form.author}
                  onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
                  placeholder="e.g. Thomas H. Cormen"
                  className="w-full rounded-xl border border-input bg-white/50 backdrop-blur-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Price (R) *</label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="250"
                    className="w-full rounded-xl border border-input bg-white/50 backdrop-blur-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Condition</label>
                  <select
                    value={form.condition}
                    onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                    className="w-full rounded-xl border border-input bg-white/50 backdrop-blur-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="new">New</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                  </select>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 p-4 space-y-3 bg-white/30 backdrop-blur-sm">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allow_swap}
                    onChange={e => setForm(f => ({ ...f, allow_swap: e.target.checked }))}
                    className="rounded border-input"
                  />
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <ArrowLeftRight className="h-4 w-4" /> Open to swapping
                  </span>
                </label>
                {form.allow_swap && (
                  <textarea
                    value={form.swap_for}
                    onChange={e => setForm(f => ({ ...f, swap_for: e.target.value }))}
                    placeholder="What would you swap for?"
                    rows={2}
                    className="w-full rounded-xl border border-input bg-white/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                )}
              </div>
              {formError && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2.5 text-sm">
                  {formError}
                </div>
              )}
              <button
                type="submit"
                className="w-full rounded-2xl bg-primary text-primary-foreground font-semibold py-3 hover:bg-primary/90 transition-colors"
              >
                {editingBook ? "Update Book" : "List Book on Marketplace"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Sold error toast */}
      {soldError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-destructive text-destructive-foreground px-5 py-3 text-sm font-medium shadow-lg">
          {soldError}
        </div>
      )}

      {/* Delete Confirm */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="glass-panel p-6 max-w-sm w-full">
            <h3 className="font-serif text-xl font-bold mb-2">Delete Book</h3>
            <p className="text-muted-foreground text-sm mb-5">Are you sure? This cannot be undone.</p>
            {deleteError && (
              <div className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2.5 text-sm">
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setDeletingId(null); setDeleteError(""); }} className="flex-1 rounded-2xl border border-border py-2.5 text-sm hover:bg-white/30 transition-colors">Cancel</button>
              <button onClick={handleDelete} className="flex-1 rounded-2xl bg-destructive text-destructive-foreground py-2.5 text-sm font-semibold hover:bg-destructive/90 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
