import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { Search, BookOpen, User, ShoppingBag, Heart, Loader2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const TABS = [
  { key: "all", label: "All" },
  { key: "users", label: "Users", icon: User },
  { key: "stories", label: "Stories", icon: BookOpen },
  { key: "books", label: "Books", icon: ShoppingBag },
];

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [tab, setTab] = useState(searchParams.get("type") || "all");
  const [results, setResults] = useState({ users: [], stories: [], books: [] });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    const type = searchParams.get("type") || "all";
    setQuery(q);
    setTab(type);
    if (q.trim()) runSearch(q, type);
  }, [searchParams]);

  function runSearch(q, type) {
    if (!q.trim()) { setResults({ users: [], stories: [], books: [] }); setSearched(false); return; }
    setLoading(true);
    apiFetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}`)
      .then(data => { setResults(data); setSearched(true); })
      .catch(() => setResults({ users: [], stories: [], books: [] }))
      .finally(() => setLoading(false));
  }

  function handleInput(val) {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchParams({ q: val, type: tab });
    }, 350);
  }

  function handleTabChange(t) {
    setTab(t);
    setSearchParams({ q: query, type: t });
  }

  function handleSubmit(e) {
    e.preventDefault();
    clearTimeout(debounceRef.current);
    setSearchParams({ q: query, type: tab });
  }

  function clearSearch() {
    setQuery("");
    setResults({ users: [], stories: [], books: [] });
    setSearched(false);
    setSearchParams({});
    inputRef.current?.focus();
  }

  const totalResults = (results.users?.length || 0) + (results.stories?.length || 0) + (results.books?.length || 0);

  const showUsers = tab === "all" || tab === "users";
  const showStories = tab === "all" || tab === "stories";
  const showBooks = tab === "all" || tab === "books";

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold mb-6">Search</h1>

      {/* Search Bar */}
      <form onSubmit={handleSubmit} className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          placeholder="Search for stories, users, or books..."
          className="w-full rounded-2xl border border-border bg-background pl-12 pr-12 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
        />
        {query && (
          <button type="button" onClick={clearSearch}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        )}
      </form>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 bg-muted/50 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => handleTabChange(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.icon && <t.icon className="h-3.5 w-3.5" />}
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        </div>
      )}

      {/* Empty prompt */}
      {!loading && !searched && (
        <div className="text-center py-20 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg">Type something to start searching</p>
        </div>
      )}

      {/* No results */}
      {!loading && searched && totalResults === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No results for "{query}"</p>
          <p className="text-sm mt-1">Try different keywords or check your spelling</p>
        </div>
      )}

      {/* Results */}
      {!loading && searched && totalResults > 0 && (
        <div className="space-y-10">

          {/* Users */}
          {showUsers && results.users?.length > 0 && (
            <section>
              <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-primary" /> Users
                <span className="text-sm font-normal text-muted-foreground">({results.users.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.users.map(user => (
                  <Link key={user.id} to={`/profile/${user.id}`}
                    className="flex items-center gap-4 p-4 rounded-2xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-md transition-all">
                    {user.profile_image_url ? (
                      <img src={user.profile_image_url} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-border shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg border-2 border-border shrink-0">
                        {(user.first_name || user.username || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username || "User"}
                      </p>
                      {user.username && <p className="text-sm text-muted-foreground">@{user.username}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{user.follower_count || 0} followers</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Stories */}
          {showStories && results.stories?.length > 0 && (
            <section>
              <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" /> Stories
                <span className="text-sm font-normal text-muted-foreground">({results.stories.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.stories.map(story => (
                  <Link key={story.id} to={`/stories/${story.id}`}
                    className="group flex flex-col border border-border/60 rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/40 transition-all bg-card">
                    {story.cover_image_url ? (
                      <div className="aspect-video overflow-hidden">
                        <img src={story.cover_image_url} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-primary/5 to-primary/20 flex items-center justify-center">
                        <BookOpen className="h-8 w-8 text-primary/30" />
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="font-serif font-bold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">{story.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">by {story.author_name}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{story.like_count || 0}</span>
                        {story.created_at && <span>{formatDistanceToNow(new Date(story.created_at))} ago</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Books */}
          {showBooks && results.books?.length > 0 && (
            <section>
              <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-primary" /> Books
                <span className="text-sm font-normal text-muted-foreground">({results.books.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.books.map(book => (
                  <Link key={book.id} to={`/books/${book.id}`}
                    className="group flex flex-col border border-border/60 rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/40 transition-all bg-card">
                    {book.image_url ? (
                      <div className="aspect-video overflow-hidden">
                        <img src={book.image_url} alt={book.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-primary/5 to-primary/20 flex items-center justify-center">
                        <ShoppingBag className="h-8 w-8 text-primary/30" />
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="font-serif font-bold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">{book.title}</h3>
                      {book.author && <p className="text-xs text-muted-foreground mt-1">by {book.author}</p>}
                      <div className="flex items-center justify-between mt-2">
                        {book.price != null && (
                          <span className="text-sm font-semibold text-primary">${Number(book.price).toFixed(2)}</span>
                        )}
                        {book.condition && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{book.condition}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}
