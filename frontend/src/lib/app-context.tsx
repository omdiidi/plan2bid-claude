import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getProjects, deleteProject as apiDeleteProject } from "@/lib/api";
import { getUserSettings, saveUserSettings } from "@/lib/supabase-settings";
import type { BackendProject, TradeCombination } from "@/types";

// Keep the Project interface compatible with existing UI
export interface Project {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  facilityType: string;
  projectType: string;
  trade: string;
  status: "queued" | "running" | "completed" | "error" | "partial";
  totalEstimate: number | null;
  createdAt: string;
  documentCount: number;
  pageCount: number;
  description: string;
  userId?: string;
  role?: "owner" | "editor" | "viewer";
  sharedBy?: string;
  queuePosition?: number;
  queuedAt?: string;
}

interface AppState {
  projects: Project[];
  loading: boolean;
  deleteProject: (id: string) => void;
  settings: Settings;
  settingsLoading: boolean;
  updateSettings: (updates: Partial<Settings>) => void;
  refreshProjects: () => Promise<void>;
  onboardingComplete: boolean;
  markOnboardingComplete: () => Promise<void>;
}

export interface MaterialPreset {
  id: string;
  name: string;
  unitPrice: number;
  unit: string;
}

export interface LaborPreset {
  id: string;
  role: string;
  hourlyRate: number;
}

export interface Settings {
  presetTrade: string;
  materialPresets: MaterialPreset[];
  laborPresets: LaborPreset[];
  enableValidation: boolean;
  markupPercent: number;
  overheadPercent: number;
  contingencyPercent: number;
  wasteDefaultPercent: number;
  savedCombinations: TradeCombination[];
  theme: "light" | "dark";
}

const defaultSettings: Settings = {
  presetTrade: "",
  materialPresets: [],
  laborPresets: [],
  enableValidation: true,
  markupPercent: 10,
  overheadPercent: 5,
  contingencyPercent: 5,
  wasteDefaultPercent: 10,
  savedCombinations: [],
  theme: "light",
};

// Map BackendProject → Project interface
function backendProjectToProject(bp: BackendProject): Project {
  // Backend stores combined project_address; parse city/state/zip if possible
  const addressParts = bp.project_address?.split(",").map(s => s.trim()) ?? [];
  const street = addressParts[0] || bp.project_address || "";
  const cityStatePart = addressParts[1] || "";
  const stateZipMatch = cityStatePart.match(/^(.+?)\s+(\w{2})\s*(\d{5})?$/);

  return {
    id: bp.id,
    name: bp.project_name || street || bp.project_address || "Untitled Project",
    address: bp.project_address || "",
    city: stateZipMatch ? stateZipMatch[1] : cityStatePart || "",
    state: stateZipMatch ? stateZipMatch[2] : "",
    zip: stateZipMatch?.[3] || "",
    facilityType: bp.facility_type || "",
    projectType: bp.project_type || "",
    trade: bp.trade || "",
    status: bp.status,
    totalEstimate: bp.total_estimate ?? null,
    createdAt: bp.created_at,
    documentCount: bp.total_documents ?? 0,
    pageCount: bp.total_pages ?? 0,
    description: bp.project_description || "",
    role: bp.role || "owner",
    sharedBy: bp.shared_by,
    queuePosition: bp.queue_position,
    queuedAt: bp.queued_at,
  };
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem("onboarding_complete") === "true"
  );

  // Wrap setter to persist to localStorage
  const markOnboardingDone = useCallback((value: boolean) => {
    setOnboardingComplete(value);
    if (value) localStorage.setItem("onboarding_complete", "true");
  }, []);

  // Load settings from Supabase on mount — use user.id to avoid re-runs on object ref changes
  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      setSettingsLoading(false);
      return;
    }
    let cancelled = false;
    setSettingsLoading(true);
    getUserSettings(userId)
      .then(data => {
        if (cancelled) return;
        const raw = (data.settings || {}) as Record<string, unknown>;
        const merged = { ...defaultSettings };
        for (const key of Object.keys(raw)) {
          if (raw[key] !== null && raw[key] !== undefined) {
            (merged as any)[key] = raw[key];
          }
        }
        setSettings(merged);
        markOnboardingDone(data.onboarding_complete);
        // Sync Supabase theme to next-themes (localStorage + DOM class)
        const savedTheme = merged.theme || "light";
        localStorage.setItem("plan2bid-theme", savedTheme);
        document.documentElement.classList.toggle("dark", savedTheme === "dark");
      })
      .catch(() => {
        // Fall back to defaults
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId, markOnboardingDone]);

  const fetchProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getProjects();
      setProjects(data.map(backendProjectToProject));
    } catch {
      // Keep existing projects on error
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const deleteProject = useCallback(async (id: string) => {
    try {
      await apiDeleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error("Failed to delete project:", err);
      // Don't remove from UI on failure — let user retry
    }
  }, []);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      if (user) {
        saveUserSettings(user.id, { settings: next }).catch(() => {});
      }
      return next;
    });
  }, [user]);

  const markOnboardingComplete = useCallback(async () => {
    markOnboardingDone(true);
    if (user) {
      await saveUserSettings(user.id, { onboarding_complete: true }).catch(() => {});
    }
  }, [user, markOnboardingDone]);

  return (
    <AppContext.Provider value={{
      projects, loading, deleteProject, settings, settingsLoading,
      updateSettings, refreshProjects: fetchProjects,
      onboardingComplete, markOnboardingComplete,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
