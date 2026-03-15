import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { BookOpen, Heart, TrendingUp, Loader2, Eye, Lock, Bot, Share2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function shareStory(story, e) {
  e.preventDefault();
  e.stopPropagation();
  const url = `${window.location.origin}/stories/${story.id}`;
  if (navigator.share) {
    navigator.share({ title: story.title, text: story.description || `Read "${story.title}" on PRaww Reads`, url });
  } else {
    navigator.clipboard.writeText(url).then(() => alert("Link copied!")).catch(() => {});
  }
}

export default function Home() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [stories, setStories] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      Promise.all([
        apiFetch("/stories").catch(() => []),
        apiFetch("/stories/trending").catch(() => []),
      ]).then(([all, trend]) => {
        setStories(all.slice(0, 12));
        setTrending(trend.slice(0, 6));
        setLoading(false);
      });
    } else {
      apiFetch("/stories/trending").catch(() => []).then(trend => {
        setTrending(trend.slice(0, 6));
        setLoading(false);
      });
    }
  }, [isAuthenticated, authLoading]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen">
        {/* Hero */}
        <div className="bg-gradient-to-br from-primary/10 via-background to-background py-20 px-4">
          <div className="text-center max-w-2xl mx-auto">
            <BookOpen className="h-16 w-16 text-primary mx-auto mb-6" />
            <h1 className="font-serif text-5xl sm:text-6xl font-bold tracking-tight text-foreground mb-4">
              PRaww Reads
            </h1>
            <p className="text-xl text-muted-foreground mb-10 max-w-xl mx-auto">
              A literary community for authors and readers. Share stories, discover great writing, and connect with fellow book lovers.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-8 py-3.5 hover:bg-primary/90 transition-colors text-base"
              >
                Create Free Account
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background font-semibold px-8 py-3.5 hover:bg-muted transition-colors text-base"
              >
                Log In
              </Link>
            </div>
          </div>
        </div>

        {/* Trending Stories — visible but locked */}
        {!loading && trending.length > 0 && (
          <div className="container mx-auto max-w-7xl px-4 py-14">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-2xl font-bold">Trending Stories</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              <Link to="/login" className="text-primary font-medium hover:underline">Log in</Link> or <Link to="/register" className="text-primary font-medium hover:underline">create an account</Link> to read these stories.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {trending.map(story => (
                <GuestStoryCard key={story.id} story={story} />
              ))}
            </div>
            <div className="mt-10 text-center">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-8 py-3 hover:bg-primary/90 transition-colors"
              >
                Join Free to Start Reading
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="bg-gradient-to-br from-primary/10 via-background to-background py-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
            PRaww Reads
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Discover stories, share books, connect with readers.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/marketplace" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-6 py-3 hover:bg-primary/90 transition-colors">
              Browse Marketplace
            </Link>
            <button
              onClick={() => document.getElementById("stories-section")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background font-semibold px-6 py-3 hover:bg-muted transition-colors cursor-pointer">
              Start Reading
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-12">
        {trending.length > 0 && (
          <section className="mb-14">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-2xl font-bold">Trending Stories</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {trending.map(story => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </section>
        )}

        <section id="stories-section">
          <h2 className="font-serif text-2xl font-bold mb-6">Recent Stories</h2>
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-10 w-10 animate-spin text-primary/50" /></div>
          ) : stories.length === 0 ? (
            <div className="text-center py-16 glass-card"  style={{border:"2px dashed rgba(0,0,0,0.10)"}}>
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No stories yet. Be the first to write one!</p>
              <Link to="/write" className="inline-flex mt-4 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">Start Writing</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {stories.map(story => <StoryCard key={story.id} story={story} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StoryCard({ story }) {
  return (
    <Link to={`/stories/${story.id}`} className="group flex flex-col glass-card glass-shimmer hover:border-primary/40 transition-all overflow-hidden relative">
      {story.cover_image_url ? (
        <div className="aspect-video overflow-hidden">
          <img src={story.cover_image_url} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
      ) : (
        <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <BookOpen className="h-10 w-10 text-primary/30" />
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-serif font-bold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">{story.title}</h3>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {story.is_paid && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 text-xs font-semibold border border-amber-200 dark:border-amber-800">
                <Lock className="h-3 w-3" /> R{story.price}
              </span>
            )}
            {story.has_ai_assist && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-2 py-0.5 text-xs font-semibold border border-violet-200 dark:border-violet-800">
                <Bot className="h-3 w-3" /> AI ASSIST
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">by {story.author_name}</p>
        {story.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{story.description}</p>
        )}
        <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{story.like_count || 0}</span>
          <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{story.view_count || 0}</span>
          {story.created_at && <span className="ml-auto">{formatDistanceToNow(new Date(story.created_at))} ago</span>}
          <button
            onClick={(e) => shareStory(story, e)}
            className="p-1 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
            title="Share story"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Link>
  );
}

function GuestStoryCard({ story }) {
  return (
    <Link
      to="/login"
      className="group flex flex-col glass-card glass-shimmer hover:border-primary/40 transition-all overflow-hidden cursor-pointer"
    >
      {story.cover_image_url ? (
        <div className="aspect-video overflow-hidden relative">
          <img src={story.cover_image_url} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-white text-sm font-semibold bg-black/60 rounded-full px-4 py-1.5">Log in to read</span>
          </div>
        </div>
      ) : (
        <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center relative">
          <BookOpen className="h-10 w-10 text-primary/30" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-primary text-sm font-semibold bg-background/80 rounded-full px-4 py-1.5">Log in to read</span>
          </div>
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-serif font-bold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">{story.title}</h3>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {story.is_paid && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 text-xs font-semibold border border-amber-200 dark:border-amber-800">
                <Lock className="h-3 w-3" /> R{story.price}
              </span>
            )}
            {story.has_ai_assist && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-2 py-0.5 text-xs font-semibold border border-violet-200 dark:border-violet-800">
                <Bot className="h-3 w-3" /> AI ASSIST
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-2">by {story.author_name}</p>
        {story.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{story.description}</p>
        )}
        <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{story.like_count || 0}</span>
          <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{story.view_count || 0}</span>
          {story.created_at && <span className="ml-auto">{formatDistanceToNow(new Date(story.created_at))} ago</span>}
        </div>
        <div className="mt-3 pt-3 border-t border-border text-xs text-primary font-medium text-center">
          Log in to read this story →
        </div>
      </div>
    </Link>
  );
}
