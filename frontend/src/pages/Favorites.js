import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { BookOpen, Loader2, BookmarkCheck, Heart } from "lucide-react";

export default function Favorites() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) { navigate("/login"); return; }
    if (!authLoading && isAuthenticated) {
      apiFetch("/stories/favorites").then(setStories).catch(() => setStories([])).finally(() => setLoading(false));
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading || loading) return <div className="flex justify-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary/50" /></div>;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-12">
      <div className="flex items-center gap-3 mb-8">
        <BookmarkCheck className="h-7 w-7 text-primary" />
        <h1 className="font-serif text-4xl font-bold">Saved Stories</h1>
      </div>
      {stories.length === 0 ? (
        <div className="text-center py-24 glass-card" style={{border:"2px dashed rgba(0,0,0,0.10)"}}>
          <BookmarkCheck className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No saved stories yet.</p>
          <Link to="/" className="inline-block mt-4 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">Browse Stories</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {stories.map(story => (
            <Link key={story.id} to={`/stories/${story.id}`} data-testid={`favorite-story-${story.id}`}>
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
                  {story.description && <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{story.description}</p>}
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <Heart className="h-3.5 w-3.5" />{story.like_count || 0}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
