import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { MessageCircle, Loader2, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Inbox() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) { navigate("/login"); return; }
    if (!authLoading && isAuthenticated) {
      apiFetch("/messages/inbox").then(setThreads).catch(() => setThreads([])).finally(() => setLoading(false));
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading || loading) return <div className="flex justify-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary/50" /></div>;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center gap-3 mb-8">
        <MessageCircle className="h-7 w-7 text-primary" />
        <h1 className="font-serif text-4xl font-bold">Inbox</h1>
        {threads.reduce((sum, t) => sum + (t.unread || 0), 0) > 0 && (
          <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
            {threads.reduce((sum, t) => sum + (t.unread || 0), 0)} unread
          </span>
        )}
      </div>
      {threads.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-border rounded-2xl">
          <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No messages yet.</p>
          <Link to="/marketplace" className="inline-block mt-4 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">Browse Marketplace</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map(thread => (
            <Link key={`${thread.book_id}-${thread.other_user_id}`} to={`/books/${thread.book_id}`} data-testid={`inbox-thread-${thread.book_id}`}>
              <div className="flex items-center gap-4 p-4 rounded-2xl border border-border/60 hover:border-primary/40 hover:shadow-md transition-all bg-card cursor-pointer group">
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
    </div>
  );
}
