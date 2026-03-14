import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { Lock, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Messages() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) { navigate("/login"); return; }
    if (!authLoading && isAuthenticated) {
      apiFetch("/dm/conversations")
        .then(setConversations)
        .catch(() => setConversations([]))
        .finally(() => setLoading(false));
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading || loading) return <div className="flex justify-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary/50" /></div>;

  const totalUnread = conversations.reduce((s, c) => s + (c.unread || 0), 0);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center gap-3 mb-2">
        <MessageCircle className="h-7 w-7 text-primary" />
        <h1 className="font-serif text-4xl font-bold">Messages</h1>
        {totalUnread > 0 && (
          <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
            {totalUnread}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8">
        <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
        End-to-end encrypted — only you and the recipient can read these messages.
      </div>

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
              className="flex items-center gap-4 p-4 rounded-2xl border border-border/60 hover:border-primary/40 hover:shadow-md transition-all bg-card cursor-pointer group"
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
    </div>
  );
}
