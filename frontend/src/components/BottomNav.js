import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "../hooks/AuthContext";
import { apiFetch } from "../lib/api";
import { BookOpen, MessageCircle, User, PenLine, Settings2 } from "lucide-react";

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
    { to: "/",           label: "Stories",  Icon: BookOpen },
    { to: "/messages",   label: "Messages", Icon: MessageCircle, badge: unread },
    { to: "/write",      label: "Write",    Icon: PenLine },
    { to: "/profile/me", label: "Profile",  Icon: User },
    { to: "/settings",   label: "Settings", Icon: Settings2 },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex justify-center"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      <nav
        className="w-[calc(100%-32px)] max-w-[400px]"
        style={{
          borderRadius: "32px",
          background: "rgba(var(--glass-bg, 255 255 255) / 0.20)",
          backdropFilter: "blur(28px) saturate(200%) brightness(1.08)",
          WebkitBackdropFilter: "blur(28px) saturate(200%) brightness(1.08)",
          border: "1px solid rgba(255, 255, 255, 0.50)",
          boxShadow:
            "0 12px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06), inset 0 1.5px 0 rgba(255,255,255,0.65), inset 0 -1px 0 rgba(255,255,255,0.12)",
        }}
      >
        <div className="flex items-stretch h-[62px] px-1.5">
          {tabs.map(({ to, label, Icon, badge }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                className="flex-1 flex flex-col items-center justify-center gap-[3px] relative transition-all duration-200"
                style={{ borderRadius: "26px" }}
              >
                {active && (
                  <span
                    className="absolute inset-[3px]"
                    style={{
                      borderRadius: "22px",
                      background: "rgba(255,255,255,0.32)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 4px rgba(0,0,0,0.06)",
                    }}
                  />
                )}
                <span className="relative z-10 flex flex-col items-center gap-[3px]">
                  <span className="relative">
                    <Icon
                      className={`h-[22px] w-[22px] transition-all duration-200 ${active ? "text-primary scale-110" : "text-foreground/40"}`}
                      strokeWidth={active ? 2.4 : 1.8}
                    />
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-0.5 leading-none">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </span>
                  <span className={`text-[10px] font-semibold leading-none tracking-tight transition-colors duration-200 ${active ? "text-primary" : "text-foreground/40"}`}>
                    {label}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
