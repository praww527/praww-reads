import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { BookText, Tag, ArrowLeftRight, Loader2, Camera, X, Edit2, Trash2, MessageCircle, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const CONDITION_LABELS = {
  new: { label: "New", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
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

  useEffect(() => { fetchBooks(); }, []);

  async function fetchBooks() {
    try {
      const data = await apiFetch("/books");
      setBooks(data);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    if (!isAuthenticated) { navigate("/login"); return; }
    setEditingBook(null);
    setForm({ title: "", author: "", price: "", condition: "good", allow_swap: false, swap_for: "", image_url: "" });
    setImagePreview(null);
    setShowForm(true);
  }

  function openEdit(book) {
    setEditingBook(book);
    setForm({ title: book.title, author: book.author || "", price: String(book.price), condition: book.condition, allow_swap: book.allow_swap, swap_for: book.swap_for || "", image_url: book.image_url || "" });
    setImagePreview(book.image_url || null);
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
      alert(err.message);
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    await apiFetch(`/api/books/${deletingId}`, { method: "DELETE" });
    setBooks(bs => bs.filter(b => b.id !== deletingId));
    setDeletingId(null);
  }

  async function handleMarkSold(book) {
    const updated = await apiFetch(`/api/books/${book.id}/sold`, { method: "POST" });
    setBooks(bs => bs.map(b => b.id === updated.id ? updated : b));
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight">Book Marketplace</h1>
          <p className="mt-3 text-lg text-muted-foreground">Buy, sell, and swap physical books within the community.</p>
        </div>
        <button
          data-testid="sell-book-btn"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-6 py-3 hover:bg-primary/90 shadow-lg shadow-primary/20 transition-colors"
        >
          <Tag className="h-5 w-5" /> Sell a Book
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-32"><Loader2 className="h-12 w-12 animate-spin text-primary/50" /></div>
      ) : books.length === 0 ? (
        <div className="text-center py-32 border-2 border-dashed border-border rounded-2xl bg-muted/10">
          <BookText className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-serif text-2xl font-semibold">Marketplace is empty</h3>
          <p className="text-muted-foreground mt-2">Be the first to list a book.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {books.map(book => {
            const cond = CONDITION_LABELS[book.condition] || CONDITION_LABELS.good;
            const isMine = user?.id === book.seller_id;
            return (
              <div key={book.id} className="group relative border border-border/60 rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary/40 transition-all duration-300 bg-card flex flex-col">
                {book.is_sold && (
                  <div className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1 rounded-full">SOLD</div>
                )}
                <Link to={`/books/${book.id}`} className="flex flex-col flex-1">
                  <div className="relative overflow-hidden bg-muted/40" style={{ aspectRatio: "4/3" }}>
                    {book.image_url ? (
                      <img src={book.image_url} alt={book.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><BookText className="h-12 w-12 text-muted-foreground/20" /></div>
                    )}
                    {book.allow_swap && (
                      <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1">
                        <ArrowLeftRight className="h-3 w-3" /> Swap OK
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex-1">
                    <h3 className="font-serif font-bold text-base leading-tight line-clamp-2 mb-1 group-hover:text-primary transition-colors">{book.title}</h3>
                    {book.author && <p className="text-xs text-muted-foreground mb-2">by {book.author}</p>}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cond.color}`}>{cond.label}</span>
                      <span className="text-xs text-muted-foreground">{book.created_at ? formatDistanceToNow(new Date(book.created_at)) + " ago" : ""}</span>
                    </div>
                    <div className="text-2xl font-bold">R{book.price}</div>
                    <p className="text-xs text-muted-foreground">15% platform commission</p>
                  </div>
                </Link>
                <div className="p-4 pt-0 flex gap-2">
                  {isMine ? (
                    <>
                      <button onClick={() => openEdit(book)} className="flex-1 flex items-center justify-center gap-1 text-sm border border-border rounded-lg px-3 py-2 hover:border-primary/40 transition-colors">
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button onClick={() => handleMarkSold(book)} className={`flex-1 flex items-center justify-center gap-1 text-sm border rounded-lg px-3 py-2 transition-colors ${book.is_sold ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-border hover:border-emerald-300"}`}>
                        <CheckCircle className="h-3.5 w-3.5" /> {book.is_sold ? "Unsell" : "Mark Sold"}
                      </button>
                      <button onClick={() => setDeletingId(book.id)} className="flex items-center justify-center text-sm border border-border rounded-lg px-3 py-2 text-destructive hover:border-destructive/40 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <Link to={`/books/${book.id}`} className="w-full flex items-center justify-center gap-1.5 text-sm bg-primary/10 text-primary border border-primary/20 rounded-lg px-3 py-2 hover:bg-primary/20 transition-colors font-medium">
                      <MessageCircle className="h-3.5 w-3.5" /> Message Seller
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Dialog */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-background rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-serif text-2xl font-bold">{editingBook ? "Edit Book" : "List a Book"}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Photo */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Book Photo <span className="text-muted-foreground text-xs">(optional)</span></label>
                <div className="relative border-2 border-dashed border-border rounded-xl overflow-hidden bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  style={{ aspectRatio: "4/3" }} onClick={() => fileRef.current?.click()}>
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      {imageProcessing && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
                      <button type="button" className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                        onClick={e => { e.stopPropagation(); setImagePreview(null); setForm(f => ({ ...f, image_url: "" })); }}>
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-8">
                      {imageProcessing ? <Loader2 className="h-8 w-8 animate-spin" /> : <><Camera className="h-8 w-8" /><span className="text-sm">Click to upload (max 2MB)</span></>}
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Book Title *</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Introduction to Algorithms"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Author <span className="text-muted-foreground text-xs">(optional)</span></label>
                <input value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
                  placeholder="e.g. Thomas H. Cormen"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Price (R) *</label>
                  <input required type="number" min="0.01" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="250"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Condition</label>
                  <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="new">New</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                  </select>
                </div>
              </div>
              <div className="rounded-xl border border-border/60 p-4 space-y-3 bg-muted/20">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.allow_swap} onChange={e => setForm(f => ({ ...f, allow_swap: e.target.checked }))}
                    className="rounded border-input" />
                  <span className="text-sm font-medium flex items-center gap-1.5"><ArrowLeftRight className="h-4 w-4" /> Open to swapping</span>
                </label>
                {form.allow_swap && (
                  <textarea value={form.swap_for} onChange={e => setForm(f => ({ ...f, swap_for: e.target.value }))}
                    placeholder="What would you swap for?" rows={2}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                )}
              </div>
              <button type="submit" className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 hover:bg-primary/90 transition-colors">
                {editingBook ? "Update Book" : "List Book on Marketplace"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-background rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-serif text-xl font-bold mb-2">Delete Book</h3>
            <p className="text-muted-foreground text-sm mb-5">Are you sure? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleDelete} className="flex-1 rounded-lg bg-destructive text-destructive-foreground py-2 text-sm font-semibold hover:bg-destructive/90 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// end of file
