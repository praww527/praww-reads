import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { ArrowLeft, BookOpen, ArrowLeftRight, Send, MessageSquare, CheckCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const CONDITION_LABELS = {
  new: { label: "New", color: "bg-emerald-100 text-emerald-700" },
  good: { label: "Good", color: "bg-blue-100 text-blue-700" },
  fair: { label: "Fair", color: "bg-amber-100 text-amber-700" },
};

export default function BookDetail() {
  const { id } = useParams();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [book, setBook] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [buyIntent, setBuyIntent] = useState(false);
  const msgEndRef = useRef(null);

  useEffect(() => { fetchBook(); }, [id]);
  useEffect(() => {
    if (user && book) fetchMessages();
  }, [book, user]);
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchBook() {
    try {
      const b = await apiFetch(`/books/${id}`);
      setBook(b);
    } catch {
      setBook(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMessages() {
    try {
      const msgs = await apiFetch(`/messages/book/${id}`);
      setMessages(msgs);
    } catch { }
  }

  async function sendMessage(text) {
    if (!text.trim() || !book || sending) return;
    if (!isAuthenticated) { navigate("/login"); return; }
    setSending(true);
    try {
      const isSeller = user.id === book.seller_id;
      let receiverId;
      if (isSeller) {
        const lastBuyerMsg = [...messages].reverse().find(m => m.sender_id !== user.id);
        if (!lastBuyerMsg) return;
        receiverId = lastBuyerMsg.sender_id;
      } else {
        receiverId = book.seller_id;
      }
      const msg = await apiFetch("/messages", { method: "POST", body: JSON.stringify({ book_id: id, receiver_id: receiverId, content: text.trim() }) });
      setMessages(prev => [...prev, msg]);
      setMsgText("");
    } finally {
      setSending(false);
    }
  }

  async function handleBuyNow() {
    if (!isAuthenticated) { navigate("/login"); return; }
    setBuyIntent(true);
    await sendMessage(`Hi! I'm interested in buying "${book.title}" for R${book.price}. Is it still available?`);
  }

  if (loading) return <div className="flex justify-center py-32"><Loader2 className="h-12 w-12 animate-spin text-primary/50" /></div>;
  if (!book) return <div className="p-8 text-center"><p className="text-destructive">Book not found</p></div>;

  const cond = CONDITION_LABELS[book.condition] || CONDITION_LABELS.good;
  const isSeller = user?.id === book.seller_id;
  const canMessage = isAuthenticated && !isSeller;
  const showThread = isAuthenticated && (messages.length > 0 || canMessage);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <Link to="/marketplace" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Marketplace
      </Link>

      <div className="grid md:grid-cols-2 gap-8 items-start mb-10">
        {/* Photo */}
        <div className="rounded-2xl overflow-hidden border border-border/60 bg-muted/30 aspect-square flex items-center justify-center">
          {book.image_url ? (
            <img src={book.image_url} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <BookOpen className="h-20 w-20 text-muted-foreground/20" />
          )}
        </div>

        {/* Info */}
        <div className="space-y-4">
          {book.is_sold && (
            <div className="inline-flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-full px-3 py-1 text-sm font-semibold">
              <CheckCircle className="h-4 w-4" /> SOLD
            </div>
          )}
          <h1 className="font-serif text-3xl font-bold leading-tight">{book.title}</h1>
          {book.author && <p className="text-muted-foreground">by {book.author}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${cond.color}`}>{cond.label}</span>
            {book.allow_swap && (
              <span className="text-sm font-medium px-3 py-1 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                <ArrowLeftRight className="h-3.5 w-3.5" /> Open to swap
              </span>
            )}
          </div>
          <div className="text-4xl font-bold tracking-tight">R{book.price}</div>
          <p className="text-xs text-muted-foreground">15% platform commission applies</p>

          {book.allow_swap && book.swap_for && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-semibold text-primary mb-1 flex items-center gap-1.5">
                <ArrowLeftRight className="h-4 w-4" /> Willing to swap for:
              </p>
              <p className="text-sm text-muted-foreground">{book.swap_for}</p>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            Listed by <span className="font-medium text-foreground">{book.seller_name || book.seller_email || "Seller"}</span>
          </div>
          {book.created_at && <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(book.created_at))} ago</p>}

          {isSeller ? (
            <div className="rounded-xl bg-muted/50 border border-border/60 p-3 text-sm text-muted-foreground">
              This is your listing. Messages from buyers appear below.
            </div>
          ) : !book.is_sold && (
            <button
              data-testid="buy-now-btn"
              onClick={handleBuyNow}
              disabled={buyIntent || sending}
              className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {buyIntent ? "Message Sent!" : "Buy Now / Contact Seller"}
            </button>
          )}
        </div>
      </div>

      {/* Messaging */}
      {showThread && (
        <div className="border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">{isSeller ? "Messages from Buyers" : "Message Seller"}</h3>
          </div>
          <div className="p-5 space-y-4">
            {messages.length > 0 && (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {messages.map(m => {
                  const isMine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${isMine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                        {isSeller && !isMine && <p className="text-xs font-semibold mb-1 opacity-70">{m.sender_name}</p>}
                        <p>{m.content}</p>
                        <p className={`text-xs mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          {m.created_at ? formatDistanceToNow(new Date(m.created_at)) + " ago" : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={msgEndRef} />
              </div>
            )}
            {messages.length === 0 && canMessage && (
              <p className="text-sm text-muted-foreground text-center py-4">No messages yet. Start the conversation!</p>
            )}
            {(canMessage || (isSeller && messages.length > 0)) && (
              <div className="flex gap-2 pt-1">
                <textarea
                  data-testid="message-input"
                  placeholder={canMessage ? "Ask about condition, availability, or propose a swap..." : "Reply to buyer..."}
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  rows={2}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(msgText); } }}
                />
                <button
                  data-testid="send-message-btn"
                  onClick={() => sendMessage(msgText)}
                  disabled={!msgText.trim() || sending}
                  className="self-end h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-60 shrink-0"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            )}
            {!user && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">Log in to message the seller</p>
                <Link to="/login" className="inline-block rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">Log In</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
