import { NavLink, useLocation } from "react-router-dom";
import { Home, FilePlus, FolderOpen, Settings, Zap, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { to: "/", icon: Home, label: "Dashboard" },
  { to: "/select-trades", icon: FilePlus, label: "New Estimate" },
  { to: "/projects", icon: FolderOpen, label: "Projects" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut } = useAuth();
  const { isAdmin } = useRole();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Nav */}
      <header className="sticky top-0 z-50 gradient-hero border-b border-sidebar-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <NavLink to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center shadow-accent">
                <Zap className="w-5 h-5 text-accent-foreground" />
              </div>
              <span className="text-xl font-extrabold text-primary-foreground tracking-tight">
                Plan<span className="text-accent">2</span>Bid
              </span>
            </NavLink>

            {/* Nav Links */}
            <nav className="flex items-center gap-1 md:gap-2">
              {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
                const isActive = to === "/"
                  ? location.pathname === "/"
                  : to === "/select-trades"
                    ? location.pathname === "/select-trades" || location.pathname === "/new-estimate"
                    : location.pathname.startsWith(to);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    className={`flex items-center gap-2 px-2.5 py-2 md:px-3 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] min-w-[44px] justify-center sm:justify-start ${
                      isActive
                        ? "bg-sidebar-accent text-accent"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </NavLink>
                );
              })}
              {isAdmin && (
                <NavLink
                  to="/admin"
                  className={`flex items-center gap-2 px-2.5 py-2 md:px-3 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] min-w-[44px] justify-center sm:justify-start ${
                    location.pathname === "/admin"
                      ? "bg-sidebar-accent text-accent"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </NavLink>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 min-h-[44px] min-w-[44px]"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
