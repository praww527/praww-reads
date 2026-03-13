import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { BookOpen, Heart, TrendingUp, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Home() {
  const [stories, setStories] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/stories").catch(() => []),
      apiFetch("/stories/trending").catch(() => []),
    ]).then(([all, trend]) => {
      setStories(all.slice(0, 12));
      setTrending(trend.slice(0, 6));
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/10 via-background to-background py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <BookOpen className="h-12 w-12 text-primary" />
          </div>
          <h1 className="font-serif text-5xl sm:text-6xl font-bold tracking-tight text-foreground mb-4">
            PRaww Reads
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Discover stories, share books, connect with readers. Your literary community awaits.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/marketplace" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-6 py-3 hover:bg-primary/90 transition-colors">
              Browse Marketplace
            </Link>
            <Link to="/write" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background font-semibold px-6 py-3 hover:bg-muted transition-colors">
              Start Writing
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-12">
        {/* Trending */}
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

        {/* All Stories */}
        <section>
          <h2 className="font-serif text-2xl font-bold mb-6">Recent Stories</h2>
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-10 w-10 animate-spin text-primary/50" /></div>
          ) : stories.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
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
    <Link to={`/stories/${story.id}`} data-testid={`story-card-${story.id}`}>
      <div className="group h-full flex flex-col border border-border/60 rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/40 transition-all duration-300 bg-card cursor-pointer">
        {story.cover_image_url ? (
          <div className="aspect-video overflow-hidden">
            <img src={story.cover_image_url} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          </div>
        ) : (
          <div className="aspect-video bg-gradient-to-br from-primary/5 to-primary/20 flex items-center justify-center">
            <BookOpen className="h-10 w-10 text-primary/30" />
          </div>
        )}
        <div className="p-4 flex-1 flex flex-col">
          <h3 className="font-serif font-bold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors mb-1">{story.title}</h3>
          <p className="text-xs text-muted-foreground mb-2">by {story.author_name || "Unknown"}</p>
          {story.description && <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{story.description}</p>}
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{story.like_count || 0}</span>
            <span>{story.created_at ? formatDistanceToNow(new Date(story.created_at)) + " ago" : ""}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
