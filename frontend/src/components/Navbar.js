import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { apiFetch } from "../lib/api";
import { BookOpen, MessageCircle, Menu, X, LogOut, User, Search } from "lucide-react";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [unreadDMs, setUnreadDMs] = useState(0);
  const [unreadMarket, setUnreadMarket] = useState(0);
  const searchInputRef = useRef(null);
  const unreadPollRef = useRef(null);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [searchOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isAuthenticated) { setUnreadDMs(0); setUnreadMarket(0); return; }
    function fetchUnread() {
      apiFetch("/dm/unread-count").then(r => setUnreadDMs(r.count || 0)).catch(() => {});
      apiFetch("/messages/unread-count").then(r => setUnreadMarket(r.count || 0)).catch(() => {});
    }
    fetchUnread();
    unreadPollRef.current = setInterval(fetchUnread, 15000);
    return () => clearInterval(unreadPollRef.current);
  }, [isAuthenticated]);

  const totalUnread = unreadDMs + unreadMarket;

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}&type=all`);
      setSearchOpen(false);
      setMobileOpen(false);
      setSearchQuery("");
    }
  }

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");

  async function handleLogout() {
    await logout();
    navigate("/");
    setDropdownOpen(false);
    setMobileOpen(false);
  }

  const displayName = user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`
    : user?.username || user?.email || "Account";

  const desktopNavLinks = [
    { to: "/", label: "Home" },
    { to: "/marketplace", label: "Marketplace", auth: true },
    { to: "/favorites", label: "Favorites", auth: true },
    { to: "/write", label: "Write", auth: true },
  ];

  return (
    <nav className="sticky top-0 z-40 w-full glass-nav">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <BookOpen className="h-7 w-7 text-primary group-hover:-rotate-12 transition-transform duration-300" />
            <span className="font-serif text-2xl font-bold tracking-tight text-primary">PRaww Reads</span>
          </Link>

          {/* Desktop Nav links */}
          <div className="hidden md:flex items-center gap-8">
            {desktopNavLinks.filter(l => !l.auth || isAuthenticated).map(l => (
              <Link key={l.to} to={l.to}
                className={`text-sm font-medium transition-colors hover:text-primary ${isActive(l.to) ? "text-primary" : "text-muted-foreground"}`}>
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right section */}
          <div className="flex items-center gap-2">

            {/* Search — desktop always, mobile only when authenticated */}
            {isAuthenticated && (
              <>
                {/* Desktop search */}
                <div className="hidden sm:flex items-center">
                  {searchOpen ? (
                    <form onSubmit={handleSearchSubmit} className="flex items-center gap-1">
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="w-48 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button type="submit" className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-primary">
                        <Search className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                        className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </form>
                  ) : (
                    <button onClick={() => setSearchOpen(true)}
                      className={`p-2 rounded-full hover:bg-muted transition-colors ${isActive("/search") ? "text-primary" : "text-muted-foreground"}`}>
                      <Search className="h-5 w-5" />
                    </button>
                  )}
                </div>

                {/* Mobile search icon (bottom nav handles navigation, this just provides search) */}
                <div className="flex sm:hidden">
                  {searchOpen ? (
                    <form onSubmit={handleSearchSubmit} className="flex items-center gap-1">
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="w-36 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                        className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </form>
                  ) : (
                    <button onClick={() => setSearchOpen(true)}
                      className={`p-2 rounded-full hover:bg-muted transition-colors ${isActive("/search") ? "text-primary" : "text-muted-foreground"}`}>
                      <Search className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Desktop: messages + user menu */}
            {isAuthenticated ? (
              <div className="hidden sm:flex items-center gap-2">
                <Link to="/messages" className={`relative p-2 rounded-full hover:bg-muted transition-colors ${isActive("/messages") ? "text-primary" : "text-muted-foreground"}`}>
                  <MessageCircle className="h-5 w-5" />
                  {totalUnread > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-0.5">
                      {totalUnread > 9 ? "9+" : totalUnread}
                    </span>
                  )}
                </Link>
                <div className="relative">
                  <button
                    data-testid="user-menu-btn"
                    onClick={() => setDropdownOpen(d => !d)}
                    className="flex items-center gap-2 rounded-full hover:bg-muted p-1 pr-3 transition-colors"
                  >
                    {user?.profile_image_url ? (
                      <img src={user.profile_image_url} alt={displayName} className="w-8 h-8 rounded-full object-cover border border-border" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm border border-border">
                        {displayName[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                    <span className="text-sm font-medium max-w-[120px] truncate">{displayName}</span>
                  </button>
                  {dropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-52 glass-panel z-50 overflow-hidden" onClick={() => setDropdownOpen(false)}>
                      <Link to="/profile/me" className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted transition-colors">
                        <User className="h-4 w-4 text-muted-foreground" /> My Profile
                      </Link>
                      <div className="border-t border-border" />
                      <button onClick={handleLogout} data-testid="logout-btn"
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/5 transition-colors">
                        <LogOut className="h-4 w-4" /> Log Out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Not authenticated — show login/signup on both mobile and desktop */
              <div className="flex items-center gap-2">
                <Link to="/login" data-testid="login-nav-btn"
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted transition-colors">
                  Log In
                </Link>
                <Link to="/register"
                  className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold hover:bg-primary/90 transition-colors">
                  Sign Up
                </Link>
              </div>
            )}

          </div>
        </div>
      </div>
    </nav>
  );
}
