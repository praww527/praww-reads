import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { ArrowLeft, ShoppingBag, Loader2, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function MarketplaceMessages() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) { navigate("/login"); return; }
    if (!authLoading && isAuthenticated) {
      apiFetch("/messages/inbox")
        .then(setThreads)
        .catch(() => setThreads([]))
        .finally(() => setLoading(false));
    }
  }, [authLoading, isAuthenticated]);

  const totalUnread = threads.reduce((s, t) => s + (t.unread || 0), 0);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-10">

      {/* Header */}
      <Link to="/messages" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Messages
      </Link>

      <div className="flex items-center gap-3 mb-6">
        {/* Group avatar */}
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center border border-emerald-200/60 shadow-sm shrink-0">
          <ShoppingBag className="h-6 w-6 text-emerald-600" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-2xl font-bold leading-tight">Marketplace</h1>
            {totalUnread > 0 && (
              <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                {totalUnread}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Messages with buyers &amp; sellers</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-32">
          <Loader2 className="h-10 w-10 animate-spin text-primary/50" />
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center py-28 border-2 border-dashed border-border rounded-3xl bg-muted/10">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="font-serif text-xl font-semibold">No marketplace messages</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Start a conversation by viewing a book listing.
          </p>
          <Link
            to="/marketplace"
            className="inline-block mt-5 rounded-2xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Browse Marketplace
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map(thread => (
            <Link
              key={`${thread.book_id}-${thread.other_user_id}`}
              to={`/books/${thread.book_id}`}
              data-testid={`inbox-thread-${thread.book_id}`}
              className="flex items-center gap-4 p-4 glass-row cursor-pointer group"
            >
              {/* Book cover / avatar */}
              <div className="relative shrink-0">
                {thread.book_image_url ? (
                  <img
                    src={thread.book_image_url}
                    alt={thread.book_title}
                    className="w-12 h-12 rounded-2xl object-cover border border-white/60 shadow-sm"
                  />
                ) : (
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm border border-white/60 shadow-sm
                    ${thread.unread > 0 ? "bg-primary text-primary-foreground" : "bg-emerald-100 text-emerald-700"}`}>
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                )}
                {/* Seller/buyer avatar badge */}
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground border-2 border-white shadow-sm">
                  {(thread.other_user_name || "?")[0].toUpperCase()}
                </div>
              </div>

              {/* Thread info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm leading-tight line-clamp-1 ${thread.unread > 0 ? "font-bold" : "font-semibold"}`}>
                    {thread.book_title || "Book Listing"}
                  </span>
                  {thread.unread > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0">
                      {thread.unread}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  with {thread.other_user_name}
                </p>
                {thread.last_message?.content && (
                  <p className={`text-xs mt-0.5 truncate ${thread.unread > 0 ? "text-foreground/80 font-medium" : "text-muted-foreground"}`}>
                    {thread.last_message.content}
                  </p>
                )}
              </div>

              {/* Time + arrow */}
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">
                  {thread.last_message?.created_at
                    ? formatDistanceToNow(new Date(thread.last_message.created_at)) + " ago"
                    : ""}
                </p>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-1 ml-auto transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
