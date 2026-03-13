import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { BookOpen, MessageCircle, Menu, X, LogOut, User } from "lucide-react";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");

  async function handleLogout() {
    await logout();
    navigate("/");
    setDropdownOpen(false);
  }

  const displayName = user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`
    : user?.username || user?.email || "Account";

  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/marketplace", label: "Marketplace" },
    { to: "/favorites", label: "Favorites", auth: true },
    { to: "/write", label: "Write", auth: true },
  ];

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <BookOpen className="h-7 w-7 text-primary group-hover:-rotate-12 transition-transform duration-300" />
            <span className="font-serif text-2xl font-bold tracking-tight text-primary">PRaww Reads</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.filter(l => !l.auth || isAuthenticated).map(l => (
              <Link key={l.to} to={l.to}
                className={`text-sm font-medium transition-colors hover:text-primary ${isActive(l.to) ? "text-primary" : "text-muted-foreground"}`}>
                {l.label}
              </Link>
            ))}
          </div>

          {/* Auth */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <div className="hidden sm:flex items-center gap-3">
                {/* Inbox icon */}
                <Link to="/inbox" className={`p-2 rounded-full hover:bg-muted transition-colors ${isActive("/inbox") ? "text-primary" : "text-muted-foreground"}`}>
                  <MessageCircle className="h-5 w-5" />
                </Link>
                {/* User dropdown */}
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
                    <div className="absolute right-0 top-full mt-2 w-52 bg-background rounded-xl border border-border shadow-xl z-50 overflow-hidden" onClick={() => setDropdownOpen(false)}>
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
              <Link to="/login" data-testid="login-nav-btn"
                className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
                Log In
              </Link>
            )}

            {/* Mobile Menu Toggle */}
            <button data-testid="mobile-menu-btn" onClick={() => setMobileOpen(v => !v)} className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 pb-4 pt-2" onClick={() => setMobileOpen(false)}>
          <div className="space-y-1 mb-3">
            {navLinks.filter(l => !l.auth || isAuthenticated).map(l => (
              <Link key={l.to} to={l.to}
                className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive(l.to) ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                {l.label}
              </Link>
            ))}
          </div>
          {isAuthenticated ? (
            <div className="border-t border-border pt-3 space-y-1">
              <Link to="/inbox" className="block px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50">Inbox</Link>
              <Link to="/profile/me" className="block px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50">Profile</Link>
              <button onClick={handleLogout} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/5">Log Out</button>
            </div>
          ) : (
            <Link to="/login" className="block text-center mt-3 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:bg-primary/90">
              Log In / Sign Up
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
