import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DollarSign, Users, FileText, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import ProjectSummaryCard from "./ProjectSummaryCard";
import TradeSummaryCard from "./TradeSummaryCard";
import MaterialsTable from "./MaterialsTable";
import LaborTable from "./LaborTable";
// TODO: Re-enable when document endpoints are live
// import DocumentViewer from "./DocumentViewer";
import SubBidComparison from "./SubBidComparison";
import type { EstimateLineItem, CostSummary, AnomalyReport, PresetMatch, ItemOverride, ItemMarkup } from "@/types";
import type { MaterialItem, LaborItem, Anomaly } from "@/lib/constants";
import { lineItemToMaterial, lineItemToLabor } from "@/lib/transformers";

// ── Transformers imported from @/lib/transformers ──

interface Props {
  projectId: string;
  tradeName: string;
  tradeItems: EstimateLineItem[];
  tradeSubtotal: CostSummary;
  anomalyReport: AnomalyReport;
  // Preset/override passthrough (from parent state)
  materialPresets: { id: string; name: string; unitPrice: number; unit: string }[];
  laborPresets: { id: string; role: string; hourlyRate: number }[];
  materialMatches: PresetMatch[];
  laborMatches: PresetMatch[];
  materialOverrides: Record<string, ItemOverride>;
  laborOverrides: Record<string, ItemOverride>;
  onMaterialOverridesChange: (overrides: Record<string, ItemOverride>) => void;
  onLaborOverridesChange: (overrides: Record<string, ItemOverride>) => void;
  dismissedMatches: Set<string>;
  canEdit: boolean;
  onDeleteMaterialItem?: (itemId: string) => void;
  onDeleteLaborItem?: (itemId: string) => void;
  onAddMaterialItem?: (item: { description: string; quantity: number; unit: string; unit_cost: number; preset_id?: string; preset_name?: string }) => void;
  onAddLaborItem?: (item: { description: string; quantity: number; unit: string; hours: number; hourly_rate: number; preset_id?: string; preset_name?: string }) => void;
  onReviewAll: () => void;
  materialMarkup?: Record<string, ItemMarkup>;
  laborMarkup?: Record<string, ItemMarkup>;
  defaultMarkupPercent?: number;
  onMaterialMarkupChange?: (itemId: string, markup: ItemMarkup) => void;
  onLaborMarkupChange?: (itemId: string, markup: ItemMarkup) => void;
  onUpdateMaterialItem?: (itemId: string, updates: { material_description?: string; description?: string }) => Promise<void>;
  onUpdateLaborItem?: (itemId: string, updates: { description?: string }) => Promise<void>;
  wasteItems?: Record<string, boolean>;
  onWasteChange?: (itemId: string, enabled: boolean) => void;
  wasteDefaultPercent?: number;
  wasteCustomPercent?: Record<string, number>;
  onWasteDefaultChange?: (pct: number) => void;
  onWasteCustomChange?: (itemId: string, pct: number | undefined) => void;
}

export default function GCTradeTab({
  projectId,
  tradeName,
  tradeItems,
  tradeSubtotal,
  anomalyReport,
  materialPresets,
  laborPresets,
  materialMatches,
  laborMatches,
  materialOverrides,
  laborOverrides,
  onMaterialOverridesChange,
  onLaborOverridesChange,
  dismissedMatches,
  canEdit,
  onDeleteMaterialItem,
  onDeleteLaborItem,
  onAddMaterialItem,
  onAddLaborItem,
  onReviewAll,
  materialMarkup,
  laborMarkup,
  defaultMarkupPercent,
  onMaterialMarkupChange,
  onLaborMarkupChange,
  onUpdateMaterialItem,
  onUpdateLaborItem,
  wasteItems,
  onWasteChange,
  wasteDefaultPercent,
  wasteCustomPercent,
  onWasteDefaultChange,
  onWasteCustomChange,
}: Props) {
  const [activeTab, setActiveTab] = useState("materials");
  const [anomaliesOpen, setAnomaliesOpen] = useState(false);
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const [adjustedMaterialSubtotal, setAdjustedMaterialSubtotal] = useState<number | null>(null);
  const [adjustedLaborSubtotal, setAdjustedLaborSubtotal] = useState<number | null>(null);

  // Filter items for this trade
  const materialItems = useMemo(
    () => tradeItems.filter(li => li.has_material).map(lineItemToMaterial),
    [tradeItems]
  );
  const laborItems = useMemo(
    () => tradeItems.filter(li => li.has_labor).map(lineItemToLabor),
    [tradeItems]
  );

  // Filter anomalies for this trade
  const anomalies = useMemo(() => {
    const result: Anomaly[] = [];
    const filterByTrade = (flags: AnomalyReport["priced_in"], type: "priced_in" | "noted") => {
      flags.forEach((a, i) => {
        // Include anomalies that match this trade or have no trade tag (project-wide)
        if (!a.trade || a.trade === tradeName) {
          result.push({
            id: `${type === "priced_in" ? "PI" : "NT"}-${tradeName}-${i + 1}`,
            type,
            category: a.category,
            description: a.description,
            affectedItems: a.affected_items,
            costImpact: a.cost_impact ?? null,
          });
        }
      });
    };
    filterByTrade(anomalyReport.priced_in, "priced_in");
    filterByTrade(anomalyReport.noted, "noted");
    return result;
  }, [anomalyReport, tradeName]);

  // Filter matches to only this trade's items
  const tradeItemIds = useMemo(() => new Set(tradeItems.map(i => i.item_id)), [tradeItems]);
  const filteredMaterialMatches = useMemo(
    () => materialMatches.filter(m => tradeItemIds.has(m.item_id)),
    [materialMatches, tradeItemIds]
  );
  const filteredLaborMatches = useMemo(
    () => laborMatches.filter(m => tradeItemIds.has(m.item_id)),
    [laborMatches, tradeItemIds]
  );

  const displayMaterialSubtotal = adjustedMaterialSubtotal ?? tradeSubtotal.materials_subtotal;
  const displayLaborSubtotal = adjustedLaborSubtotal ?? tradeSubtotal.labor_subtotal;
  const grandTotal = displayMaterialSubtotal + displayLaborSubtotal;

  const scrollToItem = (itemId: string) => {
    if (itemId.startsWith("MAT") || materialItems.some(m => m.id === itemId)) setActiveTab("materials");
    else if (itemId.startsWith("LAB") || laborItems.some(l => l.id === itemId)) setActiveTab("labor");
    setScrollToId(itemId);
    setTimeout(() => {
      const el = document.getElementById(`row-${itemId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Project Summary (secondary, collapsed by default) */}
      <ProjectSummaryCard projectId={projectId} />

      {/* Trade Summary (prominent) */}
      <TradeSummaryCard projectId={projectId} />

      {/* Per-trade Cost Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="p-5 shadow-card cursor-pointer hover:border-accent/40 transition-colors" onClick={() => setActiveTab("materials")}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Materials Subtotal</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(displayMaterialSubtotal)}</p>
          {adjustedMaterialSubtotal !== null && adjustedMaterialSubtotal !== tradeSubtotal.materials_subtotal && (
            <p className="text-[10px] text-muted-foreground mt-1">was {formatCurrency(tradeSubtotal.materials_subtotal)}</p>
          )}
        </Card>
        <Card className="p-5 shadow-card cursor-pointer hover:border-accent/40 transition-colors" onClick={() => setActiveTab("labor")}>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Labor Subtotal</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(displayLaborSubtotal)}</p>
          {adjustedLaborSubtotal !== null && adjustedLaborSubtotal !== tradeSubtotal.labor_subtotal && (
            <p className="text-[10px] text-muted-foreground mt-1">was {formatCurrency(tradeSubtotal.labor_subtotal)}</p>
          )}
        </Card>
        <Card className="p-5 shadow-card border-2 border-accent/30">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-accent" />
            <span className="text-sm text-accent font-medium">Grand Total</span>
          </div>
          <p className="text-3xl font-extrabold text-foreground">{formatCurrency(grandTotal)}</p>
        </Card>
      </div>

      {/* Subcontractor Bids */}
      <SubBidComparison projectId={projectId} trade={tradeName} aiEstimateTotal={grandTotal} tradeItems={tradeItems} />

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
            <TabsList className="h-10">
              <TabsTrigger value="materials" className="text-sm gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />Materials
              </TabsTrigger>
              <TabsTrigger value="labor" className="text-sm gap-1.5">
                <Users className="w-3.5 h-3.5" />Labor
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
              materialPresets={canEdit ? materialPresets : []}
              presetMatches={canEdit ? filteredMaterialMatches : []}
              initialOverrides={canEdit ? materialOverrides : {}}
              onOverridesChange={canEdit ? onMaterialOverridesChange : () => {}}
              onSubtotalChange={canEdit ? setAdjustedMaterialSubtotal : () => {}}
              onReviewAll={canEdit ? onReviewAll : () => {}}
              dismissedMatches={dismissedMatches}
              canEdit={canEdit}
              onDeleteItem={canEdit ? onDeleteMaterialItem : undefined}
              onAddItem={canEdit ? onAddMaterialItem : undefined}
              markupOverrides={canEdit ? materialMarkup : undefined}
              defaultMarkupPercent={defaultMarkupPercent}
              onMarkupChange={canEdit ? onMaterialMarkupChange : undefined}
              onUpdateItem={canEdit ? onUpdateMaterialItem : undefined}
              wasteItems={wasteItems}
              onWasteChange={canEdit ? onWasteChange : undefined}
              wasteDefaultPercent={wasteDefaultPercent}
              wasteCustomPercent={wasteCustomPercent}
              onWasteDefaultChange={canEdit ? onWasteDefaultChange : undefined}
              onWasteCustomChange={canEdit ? onWasteCustomChange : undefined}
            />
          </TabsContent>
          <TabsContent value="labor" className="mt-0">
            <LaborTable
              items={laborItems}
              scrollToId={activeTab === "labor" ? scrollToId : null}
              laborPresets={canEdit ? laborPresets : []}
              presetMatches={canEdit ? filteredLaborMatches : []}
              initialOverrides={canEdit ? laborOverrides : {}}
              onOverridesChange={canEdit ? onLaborOverridesChange : () => {}}
              onSubtotalChange={canEdit ? setAdjustedLaborSubtotal : () => {}}
              onReviewAll={canEdit ? onReviewAll : () => {}}
              dismissedMatches={dismissedMatches}
              canEdit={canEdit}
              onDeleteItem={canEdit ? onDeleteLaborItem : undefined}
              onAddItem={canEdit ? onAddLaborItem : undefined}
              markupOverrides={canEdit ? laborMarkup : undefined}
              defaultMarkupPercent={defaultMarkupPercent}
              onMarkupChange={canEdit ? onLaborMarkupChange : undefined}
              onUpdateItem={canEdit ? onUpdateLaborItem : undefined}
            />
          </TabsContent>
          {/* TODO: Re-enable when document endpoints are live
          <TabsContent value="documents" className="mt-0">
            <DocumentViewer projectId={projectId} />
          </TabsContent> */}
        </Tabs>
      </Card>
    </div>
  );
}
