import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "../hooks/AuthContext";
import { apiFetch } from "../lib/api";
import { BookOpen, MessageCircle, User, PenLine } from "lucide-react";

export default function BottomNav() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) { setUnread(0); return; }
    function fetchUnread() {
      Promise.all([
        apiFetch("/dm/unread-count").catch(() => ({ count: 0 })),
        apiFetch("/messages/unread-count").catch(() => ({ count: 0 })),
      ]).then(([dm, mkt]) => setUnread((dm.count || 0) + (mkt.count || 0)));
    }
    fetchUnread();
    pollRef.current = setInterval(fetchUnread, 15000);
    return () => clearInterval(pollRef.current);
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  const isActive = (path) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname === path || location.pathname.startsWith(path + "/");

  const tabs = [
    { to: "/",           label: "Stories",   Icon: BookOpen },
    { to: "/messages",   label: "Messages",  Icon: MessageCircle, badge: unread },
    { to: "/write",      label: "Write",     Icon: PenLine },
    { to: "/profile/me", label: "Profile",   Icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border/60 supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-stretch h-16">
        {tabs.map(({ to, label, Icon, badge }) => {
          const active = isActive(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="relative">
                <Icon className={`h-5 w-5 transition-transform ${active ? "scale-110" : ""}`} strokeWidth={active ? 2.5 : 2} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-0.5 leading-none">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-medium leading-none ${active ? "text-primary" : ""}`}>{label}</span>
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
      {/* Safe area for devices with home indicator */}
      <div className="h-safe-bottom bg-background/95" style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
    </nav>
  );
}
