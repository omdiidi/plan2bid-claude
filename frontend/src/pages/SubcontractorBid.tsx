import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TRADES } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { getBidInviteData, submitBid, getCompetitorBids, claimBidInvite, polishText } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import type { BidInviteData, EstimateLineItem, CostSummary } from "@/types";
import type { MaterialItem, LaborItem } from "@/lib/constants";
import { lineItemToMaterial, lineItemToLabor } from "@/lib/transformers";
import MaterialsTable from "@/components/results/MaterialsTable";
import LaborTable from "@/components/results/LaborTable";
import GCTabBar from "@/components/results/GCTabBar";
import SubProjectSummary from "@/components/results/SubProjectSummary";
import SubTradeSummary from "@/components/results/SubTradeSummary";
// TODO: Re-enable when document and chat endpoints are implemented
// import SubDocumentViewer from "@/components/results/SubDocumentViewer";
// import DocumentChat from "@/components/results/DocumentChat";
import {
  Loader2,
  AlertTriangle,
  DollarSign,
  Users,
  FileText,
  Send,
  Building2,
  Eye,
} from "lucide-react";
import { exportXlsx } from "@/lib/export/exportXlsx";
import { exportPdf } from "@/lib/export/exportPdf";
import { exportIndustryXlsx } from "@/lib/export/exportIndustryXlsx";
import type { ExportData } from "@/lib/export/types";
import ExportPopover from "@/components/ui/ExportPopover";
import { toast } from "sonner";

function tradeLabel(value: string): string {
  const found = TRADES.find(t => t.value === value);
  return found ? found.label : value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Transformers imported from @/lib/transformers ──

export default function SubcontractorBid() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<BidInviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTrade, setActiveTrade] = useState("");
  const [activeSubTab, setActiveSubTab] = useState("materials");

  // Auth state
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [authLoading, setAuthLoading] = useState(false);

  // Submit state
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [bidNotes, setBidNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Competitor view
  const [competitors, setCompetitors] = useState<Record<string, Array<{ company_name: string; total_bid: number; submitted_at: string }>>>({});
  const [showCompetitors, setShowCompetitors] = useState(false);

  // Adjusted subtotals (from table edits)
  const [adjustedMaterialSubtotal, setAdjustedMaterialSubtotal] = useState<number | null>(null);
  const [adjustedLaborSubtotal, setAdjustedLaborSubtotal] = useState<number | null>(null);

  // Added items (sub-added materials/labor)
  const [addedMaterials, setAddedMaterials] = useState<MaterialItem[]>([]);
  const [addedLabor, setAddedLabor] = useState<LaborItem[]>([]);

  // Name/description overrides (local-only, flow into bid submission)
  const [descriptionOverrides, setDescriptionOverrides] = useState<Record<string, { material_description?: string; description?: string }>>({});

  // Waste state (initialized from GC's settings)
  const [wasteItems, setWasteItems] = useState<Record<string, boolean>>({});
  const [wasteDefaultPercent, setWasteDefaultPercent] = useState(10);
  const [wasteCustomPercent, setWasteCustomPercent] = useState<Record<string, number>>({});

  // Computed item data from tables (for accurate export)
  const [matItemData, setMatItemData] = useState<Array<{ id: string; unitCost: number; qty: number; total: number }>>([]);
  const [labItemData, setLabItemData] = useState<Array<{ id: string; hours: number; rate: number; total: number }>>([]);

  // Chat auth gate — after auth, claim the invite so chat works
  const [pendingChatOpen, setPendingChatOpen] = useState(false);

  // Check auth on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser({ id: session.user.id, email: session.user.email });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setUser({ id: session.user.id, email: session.user.email });
      else setUser(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load bid data
  useEffect(() => {
    if (!token) {
      setError("Invalid bid link — no token provided.");
      setLoading(false);
      return;
    }
    getBidInviteData(token)
      .then(d => {
        setData(d);
        if (d.trades_scope.length > 0) setActiveTrade(d.trades_scope[0]);
        if (d.waste_items) setWasteItems(d.waste_items);
        if (d.waste_default_percent != null) setWasteDefaultPercent(d.waste_default_percent);
        if (d.waste_custom_percent) setWasteCustomPercent(d.waste_custom_percent);
      })
      .catch(() => setError("This bid request link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  // Load competitors if competitive view enabled
  useEffect(() => {
    if (data?.allow_competitive_view && token) {
      getCompetitorBids(token)
        .then(res => setCompetitors(res.competitors))
        .catch(() => {}); // Silent — may get 403 if disabled
    }
  }, [data, token]);

  const tradeItems = useMemo(
    () => data?.trade_sections?.[activeTrade] ?? [],
    [data, activeTrade]
  );

  const materialItems = useMemo(
    () => [...tradeItems.filter(li => li.has_material).map(lineItemToMaterial).map(item => {
      const ov = descriptionOverrides[item.id];
      if (!ov) return item;
      return {
        ...item,
        materialName: ov.material_description ?? item.materialName,
        taskDescription: ov.description ?? item.taskDescription,
      };
    }), ...addedMaterials],
    [tradeItems, addedMaterials, descriptionOverrides]
  );

  const laborItems = useMemo(
    () => [...tradeItems.filter(li => li.has_labor).map(lineItemToLabor).map(item => {
      const ov = descriptionOverrides[item.id];
      if (!ov) return item;
      return {
        ...item,
        description: ov.description ?? item.description,
      };
    }), ...addedLabor],
    [tradeItems, addedLabor, descriptionOverrides]
  );

  const handleSubUpdateMaterialItem = useCallback(async (itemId: string, updates: { material_description?: string; description?: string }) => {
    setDescriptionOverrides(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...updates },
    }));
  }, []);

  const handleSubUpdateLaborItem = useCallback(async (itemId: string, updates: { description?: string }) => {
    setDescriptionOverrides(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...updates },
    }));
  }, []);

  const tradeSubtotal: CostSummary = data?.trade_subtotals?.[activeTrade] ?? {
    materials_subtotal: 0,
    labor_subtotal: 0,
    total: 0,
  };

  const displayMat = adjustedMaterialSubtotal ?? tradeSubtotal.materials_subtotal;
  const displayLab = adjustedLaborSubtotal ?? tradeSubtotal.labor_subtotal;
  const grandTotal = displayMat + displayLab;

  const handleExport = async (format: "xlsx" | "pdf" | "industry-xlsx") => {
    if (!data) return;

    const matLookup = new Map(matItemData.map(m => [m.id, m]));
    const labLookup = new Map(labItemData.map(l => [l.id, l]));

    const adjustedItems: EstimateLineItem[] = tradeItems.map(item => {
      const clone = { ...item };
      const matAdj = matLookup.get(item.item_id);
      if (matAdj && item.has_material) {
        clone.material_unit_cost = matAdj.unitCost;
        clone.material_extended_cost = matAdj.unitCost * matAdj.qty;
        clone.quantity = matAdj.qty;
      }
      const labAdj = labLookup.get(item.item_id);
      if (labAdj && item.has_labor) {
        clone.labor_hours = labAdj.hours;
        clone.labor_hourly_rate = labAdj.rate;
        clone.labor_cost = labAdj.total;
      }
      return clone;
    });

    const addedAsLineItems = [
      ...addedMaterials.map(m => ({
        item_id: m.id, description: m.description,
        quantity: m.qty, unit: m.unit,
        has_material: true, material_unit_cost: m.unitCost,
        material_extended_cost: m.total, material_description: m.materialName,
        material_confidence: "medium" as const, material_sources: [] as never[],
        has_labor: false, labor_crew_summary: undefined,
        labor_hours: undefined, labor_hourly_rate: undefined,
        labor_cost: undefined, labor_confidence: undefined,
        labor_reasoning: undefined, labor_site_adjustments: [] as never[],
        economies_of_scale_applied: false,
        total_cost: m.total, overall_confidence: "medium" as const,
        source_refs: [] as never[], confidence_notes: "",
      } as EstimateLineItem)),
      ...addedLabor.map(l => ({
        item_id: l.id, description: l.description,
        quantity: 1, unit: "ea",
        has_material: false, has_labor: true,
        labor_hours: l.hours, labor_hourly_rate: l.hourlyRate,
        labor_cost: l.total, labor_crew_summary: l.crew,
        labor_confidence: "medium" as const, labor_site_adjustments: [] as never[],
        economies_of_scale_applied: false, material_sources: [] as never[],
        total_cost: l.total, overall_confidence: "medium" as const,
        source_refs: [] as never[], confidence_notes: "",
      } as EstimateLineItem)),
    ];

    const allItems = [...adjustedItems, ...addedAsLineItems];

    const exportData: ExportData = {
      project: {
        name: data.project_name,
        address: data.project_address,
        trade: activeTrade,
        facilityType: data.facility_type,
        projectType: data.project_type ?? "",
        generatedAt: new Date().toISOString(),
      },
      lineItems: allItems,
      costSummary: { materials_subtotal: displayMat, labor_subtotal: displayLab, total: grandTotal },
      confidenceDistribution: { high_count: 0, medium_count: 0, low_count: 0, high_percent: 0, medium_percent: 0, low_percent: 0 },
      anomalyReport: { priced_in: [], noted: [] },
      effectiveMarkup: 0, effectiveOverhead: 0, effectiveContingency: 0, effectiveTax: 0,
      materialSubtotal: displayMat, laborSubtotal: displayLab, grandTotal,
      isGcMode: false,
      wasteItems: (() => {
        const resolved: Record<string, number> = {};
        for (const [id, enabled] of Object.entries(wasteItems)) {
          if (enabled) resolved[id] = wasteCustomPercent[id] ?? wasteDefaultPercent;
        }
        return resolved;
      })(),
    };

    try {
      if (format === "xlsx") await exportXlsx(exportData);
      else if (format === "pdf") await exportPdf(exportData);
      else if (format === "industry-xlsx") await exportIndustryXlsx(exportData);
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    }
  };

  const handleAuth = async () => {
    setAuthLoading(true);
    try {
      if (authMode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: { data: { full_name: contactName || authEmail.split("@")[0] } },
        });
        if (err) throw err;
        toast.success("Account created! You can now submit your bid.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (err) throw err;
        toast.success("Signed in successfully");
      }
      setShowAuthModal(false);
      // If auth was triggered by chat, claim invite and open chat
      if (pendingChatOpen && token) {
        try {
          await claimBidInvite(token);
        } catch {
          // Claim may fail if already claimed — that's fine
        }
        setPendingChatOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleChatAuthGate = useCallback(() => {
    setPendingChatOpen(true);
    setShowAuthModal(true);
  }, []);

  const onAddMaterialItem = useCallback((item: { description: string; quantity: number; unit: string; unit_cost: number }) => {
    const newItem: MaterialItem = {
      id: `sub-mat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      description: item.description,
      materialName: item.description,
      taskDescription: item.description,
      modelNumber: null,
      manufacturer: null,
      reasoning: null,
      qty: item.quantity,
      unit: item.unit,
      unitCost: item.unit_cost,
      total: item.unit_cost * item.quantity,
      confidence: "medium",
      confidenceNotes: "Added by subcontractor",
      costLow: item.unit_cost * 0.85,
      costExpected: item.unit_cost,
      costHigh: item.unit_cost * 1.15,
      source: { document: "Sub addition", page: 0 },
      detail: { pricingMethod: "Sub-entered", sources: [], notes: "" },
    };
    setAddedMaterials(prev => [...prev, newItem]);
    toast.success("Material item added");
  }, []);

  const onAddLaborItem = useCallback((item: { description: string; quantity: number; unit: string; hours: number; hourly_rate: number }) => {
    const newItem: LaborItem = {
      id: `sub-lab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      description: item.description,
      crew: "—",
      hours: item.hours,
      hourlyRate: item.hourly_rate,
      total: item.hours * item.hourly_rate,
      confidence: "medium",
      confidenceNotes: "Added by subcontractor",
      hoursLow: item.hours * 0.85,
      hoursExpected: item.hours,
      hoursHigh: item.hours * 1.2,
      rateLow: item.hourly_rate * 0.9,
      rateExpected: item.hourly_rate,
      rateHigh: item.hourly_rate * 1.15,
      source: { document: "Sub addition", page: 0 },
      detail: { hoursBreakdown: `${item.hours} total hours`, productivityRate: "", reasoning: "", siteAdjustments: [] },
    };
    setAddedLabor(prev => [...prev, newItem]);
    toast.success("Labor item added");
  }, []);

  const handleSubmit = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (!companyName.trim() || !contactName.trim()) {
      toast.error("Please enter your company and contact name");
      return;
    }
    setSubmitting(true);
    try {
      // Build added items array for submission
      const addedItemsPayload = [
        ...addedMaterials.map(m => ({
          item_id: m.id,
          material_unit_cost: m.unitCost,
          material_extended_cost: m.total,
          description: m.description,
          quantity: m.qty,
          unit: m.unit,
          is_addition: true,
        })),
        ...addedLabor.map(l => ({
          item_id: l.id,
          labor_hours: l.hours,
          labor_hourly_rate: l.hourlyRate,
          labor_cost: l.total,
          description: l.description,
          quantity: 1,
          unit: "ea",
          is_addition: true,
        })),
        // Include description overrides as item entries
        ...Object.entries(descriptionOverrides).map(([itemId, ov]) => ({
          item_id: itemId,
          description_override: ov.material_description || ov.description || undefined,
          notes: ov.material_description || ov.description
            ? `Name/description edited by sub: ${ov.material_description ?? ""} ${ov.description ?? ""}`.trim()
            : undefined,
        })),
      ];
      await submitBid(token!, {
        trade: activeTrade,
        company_name: companyName.trim(),
        contact_name: contactName.trim(),
        total_material: displayMat,
        total_labor: displayLab,
        total_bid: grandTotal,
        notes: bidNotes.trim() || undefined,
        items: addedItemsPayload.length > 0 ? addedItemsPayload : undefined,
      });
      toast.success("Bid submitted successfully!");
      setSubmitModalOpen(false);
    } catch (err: any) {
      if (err?.status === 401) {
        setShowAuthModal(true);
        toast.error("Please sign in to submit your bid");
      } else {
        toast.error(err?.details || "Failed to submit bid");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent mx-auto" />
          <p className="text-muted-foreground">Loading bid request...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-8 max-w-md text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold">Bid Request Error</h2>
          <p className="text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-accent" />
            <div>
              <h1 className="text-sm font-semibold text-foreground">{data.project_name || "Bid Request"}</h1>
              <p className="text-xs text-muted-foreground">{data.project_address}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.allow_competitive_view && Object.keys(competitors).length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowCompetitors(true)}>
                <Eye className="w-3.5 h-3.5 mr-1" />Competitors
              </Button>
            )}
            {user && (
              <span className="text-xs text-muted-foreground">{user.email}</span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Project Info */}
        <Card className="p-5 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Project Details</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Address</p>
              <p className="font-medium">{data.project_address || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Facility</p>
              <p className="font-medium capitalize">{data.facility_type || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Trades in Scope</p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {data.trades_scope.map(t => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{tradeLabel(t)}</Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Summaries */}
        {data.overall_summary && (
          <SubProjectSummary summary={data.overall_summary} />
        )}
        {data.trade_summary && (
          <SubTradeSummary summary={data.trade_summary} />
        )}

        {/* Trade Tabs (if multiple trades) */}
        {data.trades_scope.length > 1 && (
          <GCTabBar
            tabs={data.trades_scope}
            activeTab={activeTrade}
            onTabChange={t => {
              setActiveTrade(t);
              setAdjustedMaterialSubtotal(null);
              setAdjustedLaborSubtotal(null);
              setMatItemData([]);
              setLabItemData([]);
            }}
          />
        )}

        {/* Cost Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="p-5 shadow-card cursor-pointer hover:border-accent/40 transition-colors" onClick={() => setActiveSubTab("materials")}>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Materials</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(displayMat)}</p>
          </Card>
          <Card className="p-5 shadow-card cursor-pointer hover:border-accent/40 transition-colors" onClick={() => setActiveSubTab("labor")}>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Labor</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(displayLab)}</p>
          </Card>
          <Card className="p-5 shadow-card border-2 border-accent/30">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-accent" />
              <span className="text-sm text-accent font-medium">Your Bid Total</span>
            </div>
            <p className="text-3xl font-extrabold text-foreground">{formatCurrency(grandTotal)}</p>
          </Card>
        </div>

        {/* Export */}
        <ExportPopover onExport={handleExport} />

        {/* Materials / Labor / Documents Tabs */}
        <Card className="shadow-card overflow-hidden">
          <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
            <div className="px-5 pt-5">
              <TabsList className="h-10">
                <TabsTrigger value="materials" className="text-sm gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />Materials
                </TabsTrigger>
                <TabsTrigger value="labor" className="text-sm gap-1.5">
                  <Users className="w-3.5 h-3.5" />Labor
                </TabsTrigger>
                {/* TODO: Re-enable when document endpoints are live
                {data.send_documents && (
                  <TabsTrigger value="documents" className="text-sm gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5" />Documents
                  </TabsTrigger>
                )} */}
              </TabsList>
            </div>
            <TabsContent value="materials" className="mt-0">
              <MaterialsTable
                items={materialItems}
                scrollToId={null}
                materialPresets={[]}
                presetMatches={[]}
                initialOverrides={{}}
                onOverridesChange={() => {}}
                onSubtotalChange={setAdjustedMaterialSubtotal}
                onReviewAll={() => {}}
                dismissedMatches={new Set()}
                canEdit={true}
                onAddItem={onAddMaterialItem}
                onUpdateItem={handleSubUpdateMaterialItem}
                wasteItems={wasteItems}
                onWasteChange={(id, enabled) => setWasteItems(prev => ({ ...prev, [id]: enabled }))}
                wasteDefaultPercent={wasteDefaultPercent}
                wasteCustomPercent={wasteCustomPercent}
                onWasteDefaultChange={setWasteDefaultPercent}
                onWasteCustomChange={(id, pct) => setWasteCustomPercent(prev => {
                  const next = { ...prev };
                  if (pct === undefined) delete next[id]; else next[id] = pct;
                  return next;
                })}
                onItemDataChange={setMatItemData}
              />
            </TabsContent>
            <TabsContent value="labor" className="mt-0">
              <LaborTable
                items={laborItems}
                scrollToId={null}
                laborPresets={[]}
                presetMatches={[]}
                initialOverrides={{}}
                onOverridesChange={() => {}}
                onSubtotalChange={setAdjustedLaborSubtotal}
                onReviewAll={() => {}}
                dismissedMatches={new Set()}
                canEdit={true}
                onAddItem={onAddLaborItem}
                onUpdateItem={handleSubUpdateLaborItem}
                onItemDataChange={setLabItemData}
              />
            </TabsContent>
            {/* TODO: Re-enable when document endpoints are live
            {data.send_documents && token && (
              <TabsContent value="documents" className="mt-0">
                <SubDocumentViewer token={token} />
              </TabsContent>
            )} */}
          </Tabs>
        </Card>

        {/* Submit Bar */}
        <Card className="p-5 shadow-card border-2 border-accent/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Ready to submit your bid?</p>
              <p className="text-xs text-muted-foreground">
                Your bid total: {formatCurrency(grandTotal)} for {tradeLabel(activeTrade)}
              </p>
            </div>
            <Button onClick={() => setSubmitModalOpen(true)} className="gradient-accent text-accent-foreground">
              <Send className="w-4 h-4 mr-2" />Submit Bid
            </Button>
          </div>
        </Card>
      </div>

      {/* Submit Modal — collects company info */}
      <Dialog open={submitModalOpen} onOpenChange={setSubmitModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Your Bid</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Company Name</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your company name" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Contact Name</Label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Your name" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={bidNotes} onChange={e => setBidNotes(e.target.value)} placeholder="Any notes for the GC..." className="mt-1" />
            </div>

            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Trade</span>
                <span className="font-medium">{tradeLabel(activeTrade)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Bid Total</span>
                <span className="font-bold text-accent">{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            {!user && (
              <p className="text-xs text-muted-foreground">
                You'll need to sign in or create an account to submit.
              </p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={submitting || !companyName.trim() || !contactName.trim()}
              className="w-full gradient-accent text-accent-foreground"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              {user ? "Submit Bid" : "Sign In & Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auth Modal */}
      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{authMode === "signup" ? "Create Account" : "Sign In"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="email@example.com" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Password</Label>
              <Input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Password" className="mt-1" />
            </div>
            <Button onClick={handleAuth} disabled={authLoading || !authEmail || !authPassword} className="w-full">
              {authLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {authMode === "signup" ? "Create Account" : "Sign In"}
            </Button>
            <button
              onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}
              className="text-xs text-accent hover:underline w-full text-center"
            >
              {authMode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* TODO: Re-enable when chat endpoint is implemented
      {data.project_id && (
        <DocumentChat
          projectIdOverride={data.project_id}
          onRequireAuth={handleChatAuthGate}
        />
      )} */}

      {/* Competitors Modal */}
      <Dialog open={showCompetitors} onOpenChange={setShowCompetitors}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />Competing Bids
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {Object.keys(competitors).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No other bids submitted yet.</p>
            ) : (
              Object.entries(competitors).map(([trade, bids]) => (
                <div key={trade}>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{tradeLabel(trade)}</h4>
                  <div className="space-y-1.5">
                    {bids.map((bid, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
                        <span className="text-sm font-medium">{bid.company_name}</span>
                        <span className="text-sm font-mono font-bold">{formatCurrency(bid.total_bid)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
