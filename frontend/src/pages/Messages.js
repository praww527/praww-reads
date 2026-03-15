import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { Lock, Loader2, MessageCircle, ShieldCheck, ShoppingBag, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Messages() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("dm");
  const [conversations, setConversations] = useState([]);
  const [marketplaceThreads, setMarketplaceThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) { navigate("/login"); return; }
    if (!authLoading && isAuthenticated) {
      Promise.all([
        apiFetch("/dm/conversations").catch(() => []),
        apiFetch("/messages/inbox").catch(() => []),
      ]).then(([dms, mkt]) => {
        setConversations(dms);
        setMarketplaceThreads(mkt);
      }).finally(() => setLoading(false));
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading || loading) return <div className="flex justify-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary/50" /></div>;

  const totalUnreadDM = conversations.reduce((s, c) => s + (c.unread || 0), 0);
  const totalUnreadMkt = marketplaceThreads.reduce((s, t) => s + (t.unread || 0), 0);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center gap-3 mb-6">
        <MessageCircle className="h-7 w-7 text-primary" />
        <h1 className="font-serif text-4xl font-bold">Messages</h1>
        {(totalUnreadDM + totalUnreadMkt) > 0 && (
          <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
            {totalUnreadDM + totalUnreadMkt}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 glass-card">
        <button
          onClick={() => setTab("dm")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${tab === "dm" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ShieldCheck className="h-4 w-4 text-green-500" />
          Direct Messages
          {totalUnreadDM > 0 && <span className="bg-primary text-primary-foreground text-xs font-bold px-1.5 py-0.5 rounded-full">{totalUnreadDM}</span>}
        </button>
        <button
          onClick={() => setTab("marketplace")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${tab === "marketplace" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ShoppingBag className="h-4 w-4" />
          Marketplace
          {totalUnreadMkt > 0 && <span className="bg-primary text-primary-foreground text-xs font-bold px-1.5 py-0.5 rounded-full">{totalUnreadMkt}</span>}
        </button>
      </div>

      {/* Direct Messages tab */}
      {tab === "dm" && (
        <>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
            <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
            End-to-end encrypted — only you and the recipient can read these.
          </p>
          {conversations.length === 0 ? (
            <div className="text-center py-24 border-2 border-dashed border-border rounded-2xl">
              <Lock className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">No conversations yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Visit someone's profile to send them a message.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map(conv => (
                <Link
                  key={conv.other_user_id}
                  to={`/messages/${conv.other_user_id}`}
                  className="flex items-center gap-4 p-4 glass-row cursor-pointer group"
                >
                  {conv.other_user_profile_image_url ? (
                    <img src={conv.other_user_profile_image_url} alt={conv.other_user_name} className="w-11 h-11 rounded-full object-cover border border-border shrink-0" />
                  ) : (
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${conv.unread > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {(conv.other_user_name || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm ${conv.unread > 0 ? "font-bold" : "font-semibold"}`}>{conv.other_user_name}</span>
                      {conv.unread > 0 && (
                        <span className="bg-primary text-primary-foreground text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0">{conv.unread}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Lock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      <span className="text-xs text-muted-foreground italic truncate">Encrypted message</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">
                    {conv.last_at ? formatDistanceToNow(new Date(conv.last_at)) + " ago" : ""}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Marketplace tab */}
      {tab === "marketplace" && (
        <>
          <p className="text-xs text-muted-foreground mb-4">Messages with buyers and sellers from the marketplace.</p>
          {marketplaceThreads.length === 0 ? (
            <div className="text-center py-24 border-2 border-dashed border-border rounded-2xl">
              <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No marketplace messages yet.</p>
              <Link to="/marketplace" className="inline-block mt-4 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">Browse Marketplace</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {marketplaceThreads.map(thread => (
                <Link key={`${thread.book_id}-${thread.other_user_id}`} to={`/books/${thread.book_id}`} data-testid={`inbox-thread-${thread.book_id}`}>
                  <div className="flex items-center gap-4 p-4 glass-row cursor-pointer group">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${thread.unread > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {(thread.other_user_name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{thread.other_user_name}</span>
                        {thread.unread > 0 && (
                          <span className="bg-primary text-primary-foreground text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0">{thread.unread}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">Re: {thread.book_title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">{thread.last_message?.content}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {thread.last_message?.created_at ? formatDistanceToNow(new Date(thread.last_message.created_at)) + " ago" : ""}
                      </p>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-1 ml-auto transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
