import { useState, useEffect, useCallback, useRef } from "react";
import { exportXlsx } from "@/lib/export/exportXlsx";
import { exportPdf } from "@/lib/export/exportPdf";
import { exportIndustryXlsx } from "@/lib/export/exportIndustryXlsx";
import type { ExportData } from "@/lib/export/types";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { getEstimate, matchPresets, deleteMaterialItem, deleteLaborItem, addMaterialItem, addLaborItem, updateMaterialItem, updateLaborItem, getScenarios, getScenarioDetail, getScenarioStatus, getScenarioComparison, deleteScenario, renameProject } from "@/lib/api";
import type { UpdateMaterialItemRequest, UpdateLaborItemRequest } from "@/lib/api";
import { getProjectOverrides, saveProjectOverrides, getMarkupData, saveMarkupData } from "@/lib/supabase-settings";
import { getTaxRateFromAddress } from "@/lib/state-tax-rates";
import { useAuth } from "@/hooks/useAuth";
import type { AggregatedEstimate, EstimateLineItem, PresetMatch, ItemOverride, ProjectOverrides, Scenario, ScenarioDetail, ScenarioComparison, ScenarioComparisonEntry, ItemMarkup, MarkupData } from "@/types";
import type { MaterialItem, LaborItem, Anomaly } from "@/lib/constants";
import { lineItemToMaterial, lineItemToLabor } from "@/lib/transformers";
import { formatCurrency, formatTypeLabel } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, AlertTriangle, FileText, DollarSign, Users, Calculator, Loader2, GitBranch, MessageSquare, Pencil, Check, X } from "lucide-react";
import ExportPopover from "@/components/ui/ExportPopover";
import { toast } from "sonner";
import MaterialsTable from "@/components/results/MaterialsTable";
import LaborTable from "@/components/results/LaborTable";
import ProjectSummaryCard from "@/components/results/ProjectSummaryCard";
import TradeSummaryCard from "@/components/results/TradeSummaryCard";
// TODO: Rebuild DocumentChat with Google embeddings
// import DocumentChat from "@/components/results/DocumentChat";
// TODO: Rebuild DocumentViewer when document storage is wired up
// import DocumentViewer from "@/components/results/DocumentViewer";
import ReviewMatchesDialog from "@/components/results/ReviewMatchesDialog";
import ShareButton from "@/components/sharing/ShareButton";
import ScenarioSection from "@/components/results/ScenarioSection";
import ScenarioCreator from "@/components/results/ScenarioCreator";
import ScenarioComparisonBar from "@/components/results/ScenarioComparisonBar";
import ScenarioComparisonModal from "@/components/results/ScenarioComparisonModal";
import FeedbackModal from "@/components/results/FeedbackModal";
import FinalPricingTab from "@/components/results/FinalPricingTab";
import GCTabBar from "@/components/results/GCTabBar";
import GCOverviewTab from "@/components/results/GCOverviewTab";
import GCTradeTab from "@/components/results/GCTradeTab";

// ── Transformers imported from @/lib/transformers ──

function anomalyFlagsToAnomalies(
  pricedIn: AggregatedEstimate["anomaly_report"]["priced_in"],
  noted: AggregatedEstimate["anomaly_report"]["noted"],
): Anomaly[] {
  const result: Anomaly[] = [];
  pricedIn.forEach((a, i) => result.push({
    id: `PI-${i + 1}`,
    type: "priced_in",
    category: a.category,
    description: a.description,
    affectedItems: a.affected_items,
    costImpact: a.cost_impact ?? null,
  }));
  noted.forEach((a, i) => result.push({
    id: `NT-${i + 1}`,
    type: "noted",
    category: a.category,
    description: a.description,
    affectedItems: a.affected_items,
    costImpact: a.cost_impact ?? null,
  }));
  return result;
}

export default function Results() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projects, settings, refreshProjects } = useApp();
  const project = projects.find(p => p.id === projectId);

  const [estimate, setEstimate] = useState<AggregatedEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("materials");
  const [anomaliesOpen, setAnomaliesOpen] = useState(false);
  const [scrollToId, setScrollToId] = useState<string | null>(null);

  // GC mode tab state
  const [gcActiveTab, setGcActiveTab] = useState("overview");

  // Override state
  const [materialOverrides, setMaterialOverrides] = useState<Record<string, ItemOverride>>({});
  const [laborOverrides, setLaborOverrides] = useState<Record<string, ItemOverride>>({});
  const [materialMatches, setMaterialMatches] = useState<PresetMatch[]>([]);
  const [laborMatches, setLaborMatches] = useState<PresetMatch[]>([]);
  const [adjustedMaterialSubtotal, setAdjustedMaterialSubtotal] = useState<number | null>(null);
  const [adjustedLaborSubtotal, setAdjustedLaborSubtotal] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dismissedMatches, setDismissedMatches] = useState<Set<string>>(new Set());

  // Per-line-item markup state
  const [materialMarkup, setMaterialMarkup] = useState<Record<string, ItemMarkup>>({});
  const [laborMarkup, setLaborMarkup] = useState<Record<string, ItemMarkup>>({});
  const [clientMaterialSubtotal, setClientMaterialSubtotal] = useState<number | null>(null);
  const [clientLaborSubtotal, setClientLaborSubtotal] = useState<number | null>(null);
  const markupRef = useRef<MarkupData>({ material: {}, labor: {} });

  // Scenario state
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioDetails, setScenarioDetails] = useState<Record<string, ScenarioDetail>>({});
  const [scenarioComparison, setScenarioComparison] = useState<ScenarioComparison | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [creatorParent, setCreatorParent] = useState<Scenario | null>(null);
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);

  // Rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleStartRename = useCallback(() => {
    setRenameValue(project?.name || "");
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, [project?.name]);

  const handleCancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue("");
  }, []);

  const handleConfirmRename = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || !projectId || trimmed === project?.name) {
      handleCancelRename();
      return;
    }
    setRenameSaving(true);
    try {
      await renameProject(projectId, trimmed);
      await refreshProjects();
      toast.success("Project renamed");
    } catch (err) {
      toast.error("Failed to rename project");
    } finally {
      setRenameSaving(false);
      setIsRenaming(false);
    }
  }, [renameValue, projectId, project?.name, handleCancelRename, refreshProjects]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    getEstimate(projectId)
      .then(data => {
        setEstimate(data);
        setError(null);
      })
      .catch(err => {
        setError((err as Error).message);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  // Per-project markup/overhead/contingency
  const [projectMarkup, setProjectMarkup] = useState<number | null>(null);
  const [projectOverhead, setProjectOverhead] = useState<number | null>(null);
  const [projectContingency, setProjectContingency] = useState<number | null>(null);
  const [projectTax, setProjectTax] = useState<number | null>(null);
  const [wasteItems, setWasteItems] = useState<Record<string, boolean>>({});
  const [wasteDefaultPercent, setWasteDefaultPercent] = useState(settings.wasteDefaultPercent);
  const [wasteCustomPercent, setWasteCustomPercent] = useState<Record<string, number>>({});

  // Track full overrides object for save operations (ref to avoid re-render loops)
  const fullOverridesRef = useRef<ProjectOverrides>({ material: {}, labor: {} });

  const persistOverrides = useCallback((updated: ProjectOverrides) => {
    fullOverridesRef.current = updated;
    if (projectId && user) {
      saveProjectOverrides(projectId, user.id, updated).catch(() => {
        if (import.meta.env.DEV) console.warn("[Estim8r] Failed to persist overrides");
      });
    }
  }, [projectId, user]);

  const saveProjectPercentage = useCallback((field: "markupPercent" | "overheadPercent" | "contingencyPercent" | "taxPercent", value: number) => {
    if (!projectId) return;
    const updated = { ...fullOverridesRef.current, [field]: value };
    persistOverrides(updated);
  }, [projectId, persistOverrides]);

  const handleWasteChange = useCallback((itemId: string, enabled: boolean) => {
    setWasteItems(prev => {
      const next = { ...prev };
      if (enabled) { next[itemId] = true; } else { delete next[itemId]; }
      const updated = { ...fullOverridesRef.current, waste_items: next };
      persistOverrides(updated);
      return next;
    });
  }, [persistOverrides]);

  const handleWasteDefaultChange = useCallback((pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    setWasteDefaultPercent(clamped);
    const updated = { ...fullOverridesRef.current, waste_default_percent: clamped };
    persistOverrides(updated);
  }, [persistOverrides]);

  const handleWasteCustomChange = useCallback((itemId: string, pct: number | undefined) => {
    setWasteCustomPercent(prev => {
      const next = { ...prev };
      if (pct == null) {
        delete next[itemId];
      } else {
        next[itemId] = Math.max(0, Math.min(100, pct));
      }
      const updated = { ...fullOverridesRef.current, waste_custom_percent: next };
      persistOverrides(updated);
      return next;
    });
  }, [persistOverrides]);

  // Persist per-item markup data (separate column from overrides)
  const persistMarkup = useCallback((updated: MarkupData) => {
    markupRef.current = updated;
    if (projectId && user) {
      saveMarkupData(projectId, user.id, updated).catch(() => {
        if (import.meta.env.DEV) console.warn("[Estim8r] Failed to persist markup");
      });
    }
  }, [projectId, user]);

  const handleMaterialMarkupChange = useCallback((itemId: string, markup: ItemMarkup) => {
    setMaterialMarkup(prev => {
      const next = { ...prev, [itemId]: markup };
      persistMarkup({ ...markupRef.current, material: next });
      return next;
    });
  }, [persistMarkup]);

  const handleLaborMarkupChange = useCallback((itemId: string, markup: ItemMarkup) => {
    setLaborMarkup(prev => {
      const next = { ...prev, [itemId]: markup };
      persistMarkup({ ...markupRef.current, labor: next });
      return next;
    });
  }, [persistMarkup]);

  // Load saved overrides + trigger LLM matching after estimate loads
  useEffect(() => {
    if (!estimate || !projectId) return;

    // Load persisted overrides from API
    getProjectOverrides(projectId).then(saved => {
      fullOverridesRef.current = saved;
      setMaterialOverrides(saved.material || {});
      setLaborOverrides(saved.labor || {});
      setProjectMarkup(saved.markupPercent ?? null);
      setProjectOverhead(saved.overheadPercent ?? null);
      setProjectContingency(saved.contingencyPercent ?? null);
      setProjectTax(saved.taxPercent ?? null);
      if (saved.waste_items) setWasteItems(saved.waste_items);
      if (saved.waste_default_percent != null) setWasteDefaultPercent(saved.waste_default_percent);
      if (saved.waste_custom_percent) setWasteCustomPercent(saved.waste_custom_percent);
    }).catch(() => {});

    // Load persisted per-item markup data
    getMarkupData(projectId).then(saved => {
      markupRef.current = saved;
      setMaterialMarkup(saved.material);
      setLaborMarkup(saved.labor);
    }).catch(() => {});

    // Run async LLM matching if user has presets
    const hasMaterialPresets = settings.materialPresets.length > 0;
    const hasLaborPresets = settings.laborPresets.length > 0;
    if (!hasMaterialPresets && !hasLaborPresets) return;

    const materialLineItems = estimate.line_items.filter(li => li.has_material);
    const laborLineItems = estimate.line_items.filter(li => li.has_labor);

    matchPresets(projectId, {
      material_presets: hasMaterialPresets ? settings.materialPresets : [],
      labor_presets: hasLaborPresets ? settings.laborPresets : [],
      material_items: materialLineItems.map(li => ({
        item_id: li.item_id,
        description: li.description,
        unit: li.unit,
        material_unit_cost: li.material_unit_cost,
      })),
      labor_items: laborLineItems.map(li => ({
        item_id: li.item_id,
        description: li.description,
        labor_hourly_rate: li.labor_hourly_rate,
      })),
    }).then(result => {
      setMaterialMatches(result.material_matches);
      setLaborMatches(result.labor_matches);
    }).catch(() => {
      // Silently fail — matching is a nice-to-have
    });
  }, [estimate, projectId, settings.materialPresets, settings.laborPresets]);

  // ── Scenario loading ──

  const loadScenarios = useCallback(async () => {
    if (!projectId) return;
    try {
      const list = await getScenarios(projectId);
      setScenarios(list);
      // Load details for completed scenarios
      for (const s of list) {
        if (s.status === "completed" && !scenarioDetails[s.id]) {
          getScenarioDetail(projectId, s.id).then(detail => {
            setScenarioDetails(prev => ({ ...prev, [s.id]: detail }));
          }).catch(() => {});
        }
      }
      // Load comparison if any scenarios exist
      if (list.length > 0) {
        getScenarioComparison(projectId).then(setScenarioComparison).catch(() => {});
      }
    } catch { /* silently fail */ }
  }, [projectId, scenarioDetails]);

  useEffect(() => {
    if (estimate && projectId) loadScenarios();
  }, [estimate, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll running scenarios
  useEffect(() => {
    const running = scenarios.filter(s => s.status === "running" || s.status === "pending");
    if (running.length === 0 || !projectId) return;

    const interval = setInterval(async () => {
      let changed = false;
      for (const s of running) {
        try {
          const status = await getScenarioStatus(projectId, s.id);
          if (status.status !== s.status || status.progress !== s.progress) {
            changed = true;
            setScenarios(prev => prev.map(sc => sc.id === s.id ? { ...sc, status: status.status, progress: status.progress, summary: status.summary ?? sc.summary, reasoning: status.reasoning ?? sc.reasoning, error_message: status.error_message ?? sc.error_message } : sc));
            if (status.status === "completed") {
              getScenarioDetail(projectId, s.id).then(detail => {
                setScenarioDetails(prev => ({ ...prev, [s.id]: detail }));
              }).catch(() => {});
            }
          }
        } catch { /* ignore */ }
      }
      if (changed) {
        getScenarioComparison(projectId).then(setScenarioComparison).catch(() => {});
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [scenarios, projectId]);

  const handleScenarioCreated = useCallback((scenario: Scenario) => {
    setScenarios(prev => [...prev, scenario]);
    setCreatorOpen(false);
    setCreatorParent(null);
  }, []);

  const handleDeleteScenario = useCallback(async (scenarioId: string) => {
    if (!projectId) return;
    try {
      await deleteScenario(projectId, scenarioId);
      setScenarios(prev => prev.filter(s => s.id !== scenarioId));
      setScenarioDetails(prev => { const next = { ...prev }; delete next[scenarioId]; return next; });
      toast.success("Scenario deleted");
      if (scenarios.length <= 1) setScenarioComparison(null);
      else getScenarioComparison(projectId).then(setScenarioComparison).catch(() => {});
    } catch (err) {
      toast.error("Failed to delete scenario", { description: (err as Error).message });
    }
  }, [projectId, scenarios.length]);

  const handleSpinOff = useCallback((scenario: Scenario) => {
    setCreatorParent(scenario);
    setCreatorOpen(true);
  }, []);

  const comparisonEntries: ScenarioComparisonEntry[] = scenarioComparison?.scenarios ?? [];

  // Persist overrides on change
  const handleMaterialOverridesChange = useCallback((overrides: Record<string, ItemOverride>) => {
    setMaterialOverrides(overrides);
    const updated = { ...fullOverridesRef.current, material: overrides };
    persistOverrides(updated);
  }, [persistOverrides]);

  const handleLaborOverridesChange = useCallback((overrides: Record<string, ItemOverride>) => {
    setLaborOverrides(overrides);
    const updated = { ...fullOverridesRef.current, labor: overrides };
    persistOverrides(updated);
  }, [persistOverrides]);

  // Transform data for table components (must be before useCallbacks that reference them)
  const materialItems = estimate
    ? estimate.line_items.filter(li => li.has_material).map(lineItemToMaterial)
    : [];
  const laborItems = estimate
    ? estimate.line_items.filter(li => li.has_labor).map(lineItemToLabor)
    : [];
  const anomalies = estimate
    ? anomalyFlagsToAnomalies(estimate.anomaly_report.priced_in, estimate.anomaly_report.noted)
    : [];

  const handleApplyMaterialFromReview = useCallback((itemId: string, preset: { id: string; name: string; unitPrice: number; unit: string }) => {
    const item = materialItems.find(i => i.id === itemId);
    if (!item) return;
    const newOverrides = {
      ...materialOverrides,
      [itemId]: {
        preset_id: preset.id,
        preset_name: preset.name,
        original_value: item.costExpected,
        override_value: preset.unitPrice,
        type: "material_price" as const,
      },
    };
    handleMaterialOverridesChange(newOverrides);
  }, [materialItems, materialOverrides, handleMaterialOverridesChange]);

  const handleApplyLaborFromReview = useCallback((itemId: string, preset: { id: string; role: string; hourlyRate: number }) => {
    const item = laborItems.find(i => i.id === itemId);
    if (!item) return;
    const newOverrides = {
      ...laborOverrides,
      [itemId]: {
        preset_id: preset.id,
        preset_name: preset.role,
        original_value: item.rateExpected,
        override_value: preset.hourlyRate,
        type: "labor_rate" as const,
      },
    };
    handleLaborOverridesChange(newOverrides);
  }, [laborItems, laborOverrides, handleLaborOverridesChange]);

  const handleDismissFromReview = useCallback((itemId: string) => {
    setDismissedMatches(prev => new Set(prev).add(itemId));
  }, []);

  // ── Line item add/delete handlers ──

  const handleDeleteMaterialItem = useCallback(async (itemId: string) => {
    if (!projectId) return;
    try {
      await deleteMaterialItem(projectId, itemId);
      const updated = await getEstimate(projectId);
      setEstimate(updated);
      toast.success("Material item deleted");
    } catch (err) {
      toast.error("Failed to delete material item", { description: (err as Error).message });
    }
  }, [projectId]);

  const handleDeleteLaborItem = useCallback(async (itemId: string) => {
    if (!projectId) return;
    try {
      await deleteLaborItem(projectId, itemId);
      const updated = await getEstimate(projectId);
      setEstimate(updated);
      toast.success("Labor item deleted");
    } catch (err) {
      toast.error("Failed to delete labor item", { description: (err as Error).message });
    }
  }, [projectId]);

  const handleAddMaterialItem = useCallback(async (item: {
    description: string; quantity: number; unit: string; unit_cost: number; preset_id?: string; preset_name?: string;
  }) => {
    if (!projectId) return;
    try {
      await addMaterialItem(projectId, item);
      const updated = await getEstimate(projectId);
      setEstimate(updated);
      toast.success("Material item added");
    } catch (err) {
      toast.error("Failed to add material item", { description: (err as Error).message });
    }
  }, [projectId]);

  const handleAddLaborItem = useCallback(async (item: {
    description: string; quantity: number; unit: string; hours: number; hourly_rate: number; preset_id?: string; preset_name?: string;
  }) => {
    if (!projectId) return;
    try {
      await addLaborItem(projectId, item);
      const updated = await getEstimate(projectId);
      setEstimate(updated);
      toast.success("Labor item added");
    } catch (err) {
      toast.error("Failed to add labor item", { description: (err as Error).message });
    }
  }, [projectId]);

  const handleUpdateMaterialItem = useCallback(async (itemId: string, updates: UpdateMaterialItemRequest) => {
    if (!projectId) return;
    try {
      await updateMaterialItem(projectId, itemId, updates);
      const updated = await getEstimate(projectId);
      setEstimate(updated);
    } catch (err) {
      toast.error("Failed to update material item", { description: (err as Error).message });
      throw err; // re-throw so table component keeps edit mode open
    }
  }, [projectId]);

  const handleUpdateLaborItem = useCallback(async (itemId: string, updates: UpdateLaborItemRequest) => {
    if (!projectId) return;
    try {
      await updateLaborItem(projectId, itemId, updates);
      const updated = await getEstimate(projectId);
      setEstimate(updated);
    } catch (err) {
      toast.error("Failed to update labor item", { description: (err as Error).message });
      throw err;
    }
  }, [projectId]);

  const originalMaterialSubtotal = estimate?.cost_summary.materials_subtotal ?? 0;
  const originalLaborSubtotal = estimate?.cost_summary.labor_subtotal ?? 0;
  const displayMaterialSubtotal = adjustedMaterialSubtotal ?? originalMaterialSubtotal;
  const displayLaborSubtotal = adjustedLaborSubtotal ?? originalLaborSubtotal;
  const grandTotal = displayMaterialSubtotal + displayLaborSubtotal;

  const userRole = project?.role;
  const canEdit = userRole === "owner" || userRole === "editor";
  const canManageSharing = userRole === "owner";

  const effectiveMarkup = projectMarkup ?? settings.markupPercent;
  const effectiveOverhead = projectOverhead ?? settings.overheadPercent;
  const effectiveContingency = projectContingency ?? settings.contingencyPercent;
  const effectiveTax = projectTax ?? getTaxRateFromAddress(estimate?.project_address ?? "");

  const handleExport = async (format: "xlsx" | "pdf" | "industry-xlsx") => {
    if (!estimate) return;
    const data: ExportData = {
      project: {
        name: project?.name ?? "Untitled Project",
        address: estimate.project_address,
        trade: estimate.trade,
        facilityType: estimate.facility_type || project?.facility_type || "",
        projectType: estimate.project_type || project?.project_type || "",
        generatedAt: estimate.generated_at,
      },
      lineItems: estimate.line_items,
      costSummary: estimate.cost_summary,
      confidenceDistribution: estimate.confidence_distribution,
      anomalyReport: estimate.anomaly_report,
      effectiveMarkup,
      effectiveOverhead,
      effectiveContingency,
      effectiveTax,
      materialSubtotal: displayMaterialSubtotal,
      laborSubtotal: displayLaborSubtotal,
      grandTotal,
      isGcMode: estimate.is_gc_mode,
      tradeSections: estimate.trade_sections ?? undefined,
      tradeSubtotals: estimate.trade_subtotals ?? undefined,
      materialMarkup: materialMarkup,
      laborMarkup: laborMarkup,
      wasteItems: (() => {
        const resolved: Record<string, number> = {};
        for (const [id, enabled] of Object.entries(wasteItems)) {
          if (enabled) resolved[id] = wasteCustomPercent[id] ?? wasteDefaultPercent;
        }
        return resolved;
      })(),
    };

    try {
      if (format === "xlsx") {
        await exportXlsx(data);
      } else if (format === "pdf") {
        await exportPdf(data);
      } else if (format === "industry-xlsx") {
        await exportIndustryXlsx(data);
      }
    } catch (err) {
      toast.error(`Failed to export ${format.toUpperCase()}`, { description: (err as Error).message });
    }
  };

  const scrollToItem = (itemId: string) => {
    if (itemId.startsWith("MAT") || materialItems.some(m => m.id === itemId)) setActiveTab("materials");
    else if (itemId.startsWith("LAB") || laborItems.some(l => l.id === itemId)) setActiveTab("labor");
    setScrollToId(itemId);
    setTimeout(() => {
      const el = document.getElementById(`row-${itemId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
        <p className="text-muted-foreground">Loading estimate data...</p>
      </div>
    );
  }

  // Error state
  if (error || !estimate) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center animate-fade-in">
        <AlertTriangle className="w-10 h-10 text-warning mx-auto mb-4" />
        <h2 className="text-lg font-bold text-foreground mb-2">Could not load estimate</h2>
        <p className="text-sm text-muted-foreground mb-6">{error || "Estimate data not available."}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {isRenaming ? (
              <div className="flex items-center gap-1.5">
                <Input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleConfirmRename();
                    if (e.key === "Escape") handleCancelRename();
                  }}
                  disabled={renameSaving}
                  className="text-2xl font-extrabold h-auto py-0.5 px-2 max-w-md"
                  maxLength={200}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleConfirmRename} disabled={renameSaving}>
                  <Check className="w-4 h-4 text-success" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelRename} disabled={renameSaving}>
                  <X className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-extrabold text-foreground">{project?.name || "Estimate Results"}</h1>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleStartRename}>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-muted-foreground text-sm">
              {estimate.project_address}
              {estimate.facility_type ? ` · ${formatTypeLabel(estimate.facility_type)}` : ""}
              {estimate.project_type ? ` · ${formatTypeLabel(estimate.project_type)}` : ""}
            </p>
            {!estimate.is_gc_mode && (
              <Badge variant="secondary" className="text-[10px] font-medium">{formatTypeLabel(estimate.trade)}</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => setFeedbackOpen(true)}
            className="gap-1 bg-yellow-500 hover:bg-yellow-600 text-black border-none"
          >
            <MessageSquare className="w-4 h-4" />
            Feedback
          </Button>
          <FeedbackModal
            projectId={projectId!}
            open={feedbackOpen}
            onOpenChange={setFeedbackOpen}
          />
          {canManageSharing && (
            <ShareButton projectId={projectId!} projectName={project?.name} />
          )}
          {canEdit && project?.status === "completed" && (
            <Button variant="outline" size="sm" onClick={() => { setCreatorParent(null); setCreatorOpen(true); }} className="gap-1">
              <GitBranch className="w-4 h-4" />Scenario
            </Button>
          )}
          <ExportPopover onExport={handleExport} />
        </div>
      </div>

      {/* Pipeline Warnings — shown when estimate completed with degraded data */}
      {(estimate?.warnings?.length ?? 0) > 0 && (
        <Card className="p-5 shadow-card border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-foreground text-sm">
                This estimate has {estimate!.warnings!.length} warning{estimate!.warnings!.length > 1 ? "s" : ""}
              </p>
              <ul className="mt-2 space-y-1">
                {estimate!.warnings!.map((w, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-warning mt-0.5">&#x2022;</span>
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Scenario Comparison Bar */}
      {comparisonEntries.length > 0 && (
        <ScenarioComparisonBar
          scenarios={comparisonEntries}
          baseTotal={grandTotal}
          onSelectScenario={(id) => {
            const el = document.getElementById(`scenario-${id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onCompareAll={() => setComparisonModalOpen(true)}
          onAddScenario={() => { setCreatorParent(null); setCreatorOpen(true); }}
        />
      )}

      {/* ── GC Mode vs Single-Trade Content ── */}
      {estimate.is_gc_mode && estimate.trade_sections ? (
        <>
          {/* GC Top-Level Trade Tabs */}
          <GCTabBar
            tabs={["overview", ...Object.keys(estimate.trade_sections)]}
            activeTab={gcActiveTab}
            onTabChange={setGcActiveTab}
            overviewLabel={
              (() => {
                const combo = settings.savedCombinations?.find(c =>
                  c.trades.length === Object.keys(estimate.trade_sections!).length &&
                  c.trades.every(t => t in estimate.trade_sections!)
                );
                return combo?.name ?? "All Trades";
              })()
            }
          />

          {gcActiveTab === "overview" ? (
            <GCOverviewTab
              projectId={projectId!}
              tradeSubtotals={estimate.trade_subtotals}
              displayMaterialSubtotal={displayMaterialSubtotal}
              displayLaborSubtotal={displayLaborSubtotal}
              originalMaterialSubtotal={originalMaterialSubtotal}
              originalLaborSubtotal={originalLaborSubtotal}
              clientMaterialSubtotal={clientMaterialSubtotal}
              clientLaborSubtotal={clientLaborSubtotal}
              markupPercent={effectiveMarkup}
              overheadPercent={effectiveOverhead}
              contingencyPercent={effectiveContingency}
              onMarkupChange={(v) => { setProjectMarkup(v); saveProjectPercentage("markupPercent", v); }}
              onOverheadChange={(v) => { setProjectOverhead(v); saveProjectPercentage("overheadPercent", v); }}
              onContingencyChange={(v) => { setProjectContingency(v); saveProjectPercentage("contingencyPercent", v); }}
              taxPercent={effectiveTax}
              onTaxChange={(v) => { setProjectTax(v); saveProjectPercentage("taxPercent", v); }}
              tradeSections={estimate.trade_sections ?? undefined}
            />
          ) : (
            <GCTradeTab
              key={gcActiveTab}
              projectId={projectId!}
              tradeName={gcActiveTab}
              tradeItems={estimate.trade_sections[gcActiveTab] ?? []}
              tradeSubtotal={estimate.trade_subtotals?.[gcActiveTab] ?? { materials_subtotal: 0, labor_subtotal: 0, total: 0 }}
              anomalyReport={estimate.anomaly_report}
              materialPresets={canEdit ? settings.materialPresets : []}
              laborPresets={canEdit ? settings.laborPresets : []}
              materialMatches={materialMatches}
              laborMatches={laborMatches}
              materialOverrides={materialOverrides}
              laborOverrides={laborOverrides}
              onMaterialOverridesChange={canEdit ? handleMaterialOverridesChange : () => {}}
              onLaborOverridesChange={canEdit ? handleLaborOverridesChange : () => {}}
              dismissedMatches={dismissedMatches}
              canEdit={canEdit}
              onDeleteMaterialItem={canEdit ? handleDeleteMaterialItem : undefined}
              onDeleteLaborItem={canEdit ? handleDeleteLaborItem : undefined}
              onAddMaterialItem={canEdit ? handleAddMaterialItem : undefined}
              onAddLaborItem={canEdit ? handleAddLaborItem : undefined}
              onReviewAll={() => setReviewOpen(true)}
              materialMarkup={canEdit ? materialMarkup : undefined}
              laborMarkup={canEdit ? laborMarkup : undefined}
              defaultMarkupPercent={effectiveMarkup}
              onMaterialMarkupChange={canEdit ? handleMaterialMarkupChange : undefined}
              onLaborMarkupChange={canEdit ? handleLaborMarkupChange : undefined}
              onUpdateMaterialItem={canEdit ? handleUpdateMaterialItem : undefined}
              onUpdateLaborItem={canEdit ? handleUpdateLaborItem : undefined}
              wasteItems={wasteItems}
              onWasteChange={canEdit ? handleWasteChange : undefined}
              wasteDefaultPercent={wasteDefaultPercent}
              wasteCustomPercent={wasteCustomPercent}
              onWasteDefaultChange={canEdit ? handleWasteDefaultChange : undefined}
              onWasteCustomChange={canEdit ? handleWasteCustomChange : undefined}
            />
          )}
        </>
      ) : (
        <>
          {/* Single-Trade Content */}
          <ProjectSummaryCard projectId={projectId!} />
          <TradeSummaryCard projectId={projectId!} />

          {/* Cost Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="p-5 shadow-card cursor-pointer hover:border-accent/40 transition-colors" onClick={() => setActiveTab("materials")}>
              <div className="flex items-center gap-2 mb-2"><DollarSign className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Materials Subtotal</span></div>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(displayMaterialSubtotal)}</p>
              {adjustedMaterialSubtotal !== null && adjustedMaterialSubtotal !== originalMaterialSubtotal && (
                <p className="text-[10px] text-muted-foreground mt-1">was {formatCurrency(originalMaterialSubtotal)}</p>
              )}
            </Card>
            <Card className="p-5 shadow-card cursor-pointer hover:border-accent/40 transition-colors" onClick={() => setActiveTab("labor")}>
              <div className="flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Labor Subtotal</span></div>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(displayLaborSubtotal)}</p>
              {adjustedLaborSubtotal !== null && adjustedLaborSubtotal !== originalLaborSubtotal && (
                <p className="text-[10px] text-muted-foreground mt-1">was {formatCurrency(originalLaborSubtotal)}</p>
              )}
            </Card>
            <Card className="p-5 shadow-card border-2 border-accent/30">
              <div className="flex items-center gap-2 mb-2"><FileText className="w-4 h-4 text-accent" /><span className="text-sm text-accent font-medium">Grand Total</span></div>
              <p className="text-3xl font-extrabold text-foreground">{formatCurrency(grandTotal)}</p>
            </Card>
          </div>

          {/* Anomaly Panel */}
          {anomalies.length > 0 && (
            <Collapsible open={anomaliesOpen} onOpenChange={setAnomaliesOpen}>
              <Card className="shadow-card overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                      <span className="text-sm font-semibold text-foreground">Anomalies ({anomalies.length})</span>
                    </div>
                    {anomaliesOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-5 pb-5 space-y-3">
                    {(["priced_in", "noted"] as const).map(type => {
                      const filtered = anomalies.filter(a => a.type === type);
                      if (!filtered.length) return null;
                      return (
                        <div key={type}>
                          <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${type === "priced_in" ? "text-destructive" : "text-warning"}`}>
                            {type === "priced_in" ? "Priced In" : "Noted"}
                          </h4>
                          {filtered.map(a => (
                            <Collapsible key={a.id}>
                              <div className={`p-3 rounded-lg mb-2 ${type === "priced_in" ? "bg-destructive/5 border border-destructive/20" : "bg-warning/5 border border-warning/20"}`}>
                                <CollapsibleTrigger asChild>
                                  <button className="w-full flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary" className="text-[10px]">{a.category}</Badge>
                                      {a.costImpact != null && <span className="text-xs font-mono text-destructive">+{formatCurrency(a.costImpact)}</span>}
                                    </div>
                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                                  </button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <p className="text-sm text-foreground mt-2">{a.description}</p>
                                  <div className="flex gap-1 mt-2">
                                    {a.affectedItems.map(id => (
                                      <button key={id} onClick={() => scrollToItem(id)} className="text-xs text-accent hover:underline font-mono">{id}</button>
                                    ))}
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Tabbed Line Items */}
          <Card className="shadow-card overflow-hidden">
            <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setScrollToId(null); }}>
              <div className="px-5 pt-5">
                <TabsList className="h-auto grid grid-cols-2 sm:inline-flex sm:h-10">
                  <TabsTrigger value="materials" className="text-sm gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" />Materials
                  </TabsTrigger>
                  <TabsTrigger value="labor" className="text-sm gap-1.5">
                    <Users className="w-3.5 h-3.5" />Labor
                  </TabsTrigger>
                  <TabsTrigger value="final" className="text-sm gap-1.5">
                    <Calculator className="w-3.5 h-3.5" />Final Pricing
                  </TabsTrigger>
                  {/* TODO: Re-enable when document endpoints are live
                  <TabsTrigger value="documents" className="text-sm gap-1.5">
                    <FileText className="w-3.5 h-3.5" />Documents
                  </TabsTrigger> */}
                </TabsList>
              </div>
              <TabsContent value="materials" className="mt-0">
                <MaterialsTable
                  items={materialItems}
                  scrollToId={activeTab === "materials" ? scrollToId : null}
                  materialPresets={canEdit ? settings.materialPresets : []}
                  presetMatches={canEdit ? materialMatches : []}
                  initialOverrides={canEdit ? materialOverrides : {}}
                  onOverridesChange={canEdit ? handleMaterialOverridesChange : () => {}}
                  onSubtotalChange={canEdit ? setAdjustedMaterialSubtotal : () => {}}
                  onReviewAll={canEdit ? () => setReviewOpen(true) : () => {}}
                  dismissedMatches={dismissedMatches}
                  canEdit={canEdit}
                  onDeleteItem={canEdit ? handleDeleteMaterialItem : undefined}
                  onAddItem={canEdit ? handleAddMaterialItem : undefined}
                  markupOverrides={canEdit ? materialMarkup : undefined}
                  defaultMarkupPercent={effectiveMarkup}
                  onMarkupChange={canEdit ? handleMaterialMarkupChange : undefined}
                  onClientSubtotalChange={canEdit ? setClientMaterialSubtotal : undefined}
                  wasteItems={wasteItems}
                  onWasteChange={canEdit ? handleWasteChange : undefined}
                  wasteDefaultPercent={wasteDefaultPercent}
                  wasteCustomPercent={wasteCustomPercent}
                  onWasteDefaultChange={canEdit ? handleWasteDefaultChange : undefined}
                  onWasteCustomChange={canEdit ? handleWasteCustomChange : undefined}
                  onUpdateItem={canEdit ? handleUpdateMaterialItem : undefined}
                />
              </TabsContent>
              <TabsContent value="labor" className="mt-0">
                <LaborTable
                  items={laborItems}
                  scrollToId={activeTab === "labor" ? scrollToId : null}
                  laborPresets={canEdit ? settings.laborPresets : []}
                  presetMatches={canEdit ? laborMatches : []}
                  initialOverrides={canEdit ? laborOverrides : {}}
                  onOverridesChange={canEdit ? handleLaborOverridesChange : () => {}}
                  onSubtotalChange={canEdit ? setAdjustedLaborSubtotal : () => {}}
                  onReviewAll={canEdit ? () => setReviewOpen(true) : () => {}}
                  dismissedMatches={dismissedMatches}
                  canEdit={canEdit}
                  onDeleteItem={canEdit ? handleDeleteLaborItem : undefined}
                  onAddItem={canEdit ? handleAddLaborItem : undefined}
                  markupOverrides={canEdit ? laborMarkup : undefined}
                  defaultMarkupPercent={effectiveMarkup}
                  onMarkupChange={canEdit ? handleLaborMarkupChange : undefined}
                  onClientSubtotalChange={canEdit ? setClientLaborSubtotal : undefined}
                  onUpdateItem={canEdit ? handleUpdateLaborItem : undefined}
                />
              </TabsContent>
              <TabsContent value="final" className="mt-0">
                <FinalPricingTab
                  materialSubtotal={displayMaterialSubtotal}
                  laborSubtotal={displayLaborSubtotal}
                  originalMaterialSubtotal={originalMaterialSubtotal}
                  originalLaborSubtotal={originalLaborSubtotal}
                  clientMaterialSubtotal={clientMaterialSubtotal}
                  clientLaborSubtotal={clientLaborSubtotal}
                  markupPercent={effectiveMarkup}
                  overheadPercent={effectiveOverhead}
                  contingencyPercent={effectiveContingency}
                  onMarkupChange={(v) => { setProjectMarkup(v); saveProjectPercentage("markupPercent", v); }}
                  onOverheadChange={(v) => { setProjectOverhead(v); saveProjectPercentage("overheadPercent", v); }}
                  onContingencyChange={(v) => { setProjectContingency(v); saveProjectPercentage("contingencyPercent", v); }}
                  taxPercent={effectiveTax}
                  onTaxChange={(v) => { setProjectTax(v); saveProjectPercentage("taxPercent", v); }}
                />
              </TabsContent>
              {/* TODO: Re-enable when document endpoints are live
              <TabsContent value="documents" className="mt-0">
              </TabsContent> */}
            </Tabs>
          </Card>
        </>
      )}

      {/* Scenario Sections */}
      {scenarios.map(s => {
        const detail = scenarioDetails[s.id];
        const entry = comparisonEntries.find(e => e.id === s.id);
        const delta = entry?.delta_from_base ?? null;

        const sMaterialItems = detail
          ? detail.line_items.filter(li => li.has_material).map(lineItemToMaterial)
          : [];
        const sLaborItems = detail
          ? detail.line_items.filter(li => li.has_labor).map(lineItemToLabor)
          : [];
        const sMaterialSubtotal = detail?.cost_summary.materials_subtotal ?? 0;
        const sLaborSubtotal = detail?.cost_summary.labor_subtotal ?? 0;

        return (
          <div key={s.id} id={`scenario-${s.id}`}>
            <ScenarioSection
              name={s.name}
              scenario={s}
              delta={delta}
              defaultOpen={false}
              onSpinOff={() => handleSpinOff(s)}
              onDelete={() => handleDeleteScenario(s.id)}
            >
              {detail && (
                <Tabs defaultValue="materials">
                  <div className="px-5 pt-3">
                    <TabsList className="h-10">
                      <TabsTrigger value="materials" className="text-sm gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" />Materials
                      </TabsTrigger>
                      <TabsTrigger value="labor" className="text-sm gap-1.5">
                        <Users className="w-3.5 h-3.5" />Labor
                      </TabsTrigger>
                      <TabsTrigger value="final" className="text-sm gap-1.5">
                        <Calculator className="w-3.5 h-3.5" />Final Pricing
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="materials" className="mt-0">
                    <MaterialsTable
                      items={sMaterialItems}
                      scrollToId={null}
                      materialPresets={[]}
                      presetMatches={[]}
                      initialOverrides={{}}
                      onOverridesChange={() => {}}
                      onSubtotalChange={() => {}}
                      onReviewAll={() => {}}
                      dismissedMatches={new Set()}
                      canEdit={false}
                    />
                  </TabsContent>
                  <TabsContent value="labor" className="mt-0">
                    <LaborTable
                      items={sLaborItems}
                      scrollToId={null}
                      laborPresets={[]}
                      presetMatches={[]}
                      initialOverrides={{}}
                      onOverridesChange={() => {}}
                      onSubtotalChange={() => {}}
                      onReviewAll={() => {}}
                      dismissedMatches={new Set()}
                      canEdit={false}
                    />
                  </TabsContent>
                  <TabsContent value="final" className="mt-0">
                    <FinalPricingTab
                      materialSubtotal={sMaterialSubtotal}
                      laborSubtotal={sLaborSubtotal}
                      originalMaterialSubtotal={originalMaterialSubtotal}
                      originalLaborSubtotal={originalLaborSubtotal}
                      markupPercent={effectiveMarkup}
                      overheadPercent={effectiveOverhead}
                      contingencyPercent={effectiveContingency}
                      onMarkupChange={() => {}}
                      onOverheadChange={() => {}}
                      onContingencyChange={() => {}}
                    />
                  </TabsContent>
                </Tabs>
              )}
            </ScenarioSection>
          </div>
        );
      })}

      {/* Scenario Creator Panel */}
      {creatorOpen && (
        <ScenarioCreator
          projectId={projectId!}
          parentScenario={creatorParent}
          scenarioCount={scenarios.length}
          onCreated={handleScenarioCreated}
          onClose={() => { setCreatorOpen(false); setCreatorParent(null); }}
        />
      )}

      {/* Scenario Comparison Modal */}
      <ScenarioComparisonModal
        open={comparisonModalOpen}
        onOpenChange={setComparisonModalOpen}
        comparison={scenarioComparison}
      />

      {/* Document Chat */}
      {/* <DocumentChat /> */}

      {/* Review Matches Dialog */}
      <ReviewMatchesDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        materialMatches={materialMatches}
        laborMatches={laborMatches}
        materialPresets={settings.materialPresets}
        laborPresets={settings.laborPresets}
        materialItems={materialItems}
        laborItems={laborItems}
        materialOverrides={materialOverrides}
        laborOverrides={laborOverrides}
        dismissedMatches={dismissedMatches}
        onApplyMaterial={handleApplyMaterialFromReview}
        onApplyLabor={handleApplyLaborFromReview}
        onDismiss={handleDismissFromReview}
      />
    </div>
  );
}
