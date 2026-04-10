import React from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "@/lib/app-context";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { RoleProvider } from "@/hooks/useRole";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import NewEstimate from "@/pages/NewEstimate";
import Projects from "@/pages/Projects";
import SettingsPage from "@/pages/SettingsPage";
import Progress from "@/pages/Progress";
import Results from "@/pages/Results";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import AdminDashboard from "@/pages/AdminDashboard";
import Onboarding from "@/pages/Onboarding";
import SelectTrades from "@/pages/SelectTrades";
import NotFound from "@/pages/NotFound";
import AcceptShare from "@/pages/AcceptShare";
import SubcontractorBid from "@/pages/SubcontractorBid";
import { ThemeProvider } from "next-themes";
import { Loader2, AlertTriangle } from "lucide-react";

// ── Error Boundary ──────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string; errorStack: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "", errorStack: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message, errorStack: error.stack || "" };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-muted">
          <div className="text-center max-w-md space-y-4">
            <AlertTriangle className="w-12 h-12 text-warning mx-auto" />
            <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
            <p className="text-muted-foreground">
              An unexpected error occurred. Please refresh the page to try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg gradient-accent text-accent-foreground font-semibold shadow-accent"
            >
              Refresh Page
            </button>
            <div className="text-left bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-3 mt-4 text-xs font-mono overflow-auto max-h-48">
              <p className="text-red-700 dark:text-red-300 font-bold">{this.state.errorMessage}</p>
              <pre className="text-red-500 dark:text-red-400 mt-2 whitespace-pre-wrap">{this.state.errorStack}</pre>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Protected Route ─────────────────────────────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { onboardingComplete, settingsLoading } = useApp();
  const location = useLocation();

  if (loading || settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (
    !onboardingComplete &&
    location.pathname !== "/onboarding" &&
    !location.pathname.startsWith("/share/")
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
      <Route path="/auth/callback" element={<Navigate to="/" replace />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/bid/:token" element={<SubcontractorBid />} />
      <Route path="/onboarding" element={
        <ProtectedRoute>
          <Onboarding />
        </ProtectedRoute>
      } />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/select-trades" element={<SelectTrades />} />
                <Route path="/new-estimate" element={<NewEstimate />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/progress/:projectId" element={<Progress />} />
                <Route path="/results/:projectId" element={<Results />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/share/:token" element={<AcceptShare />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" storageKey="plan2bid-theme" disableTransitionOnChange>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <RoleProvider>
              <AppProvider>
                <AppRoutes />
              </AppProvider>
            </RoleProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
