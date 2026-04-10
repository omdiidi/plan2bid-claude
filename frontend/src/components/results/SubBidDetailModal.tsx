import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatCurrencyDetailed } from "@/lib/utils";
import { getSubBidDetail } from "@/lib/api";
import { TRADES } from "@/lib/constants";
import type { SubBidDetail, SubBidItem, EstimateLineItem } from "@/types";
import type { MaterialItem, LaborItem } from "@/lib/constants";
import { lineItemToMaterial, lineItemToLabor } from "@/lib/transformers";
import { Loader2, AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  submissionId: number;
  aiItems?: EstimateLineItem[];
}

function tradeLabel(value: string): string {
  const found = TRADES.find(t => t.value === value);
  return found ? found.label : value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function SubBidDetailModal({ open, onOpenChange, projectId, submissionId, aiItems = [] }: Props) {
  const [data, setData] = useState<SubBidDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !submissionId) return;
    setLoading(true);
    setError(false);
    setData(null);
    getSubBidDetail(projectId, submissionId)
      .then(setData)
      .catch(() => {
        setError(true);
        toast.error("Failed to load bid details");
      })
      .finally(() => setLoading(false));
  }, [open, projectId, submissionId]);

  // Build AI item lookups using the same transformers the tables use
  const aiByItemId = new Map<string, EstimateLineItem>();
  const aiMaterialById = new Map<string, MaterialItem>();
  const aiLaborById = new Map<string, LaborItem>();
  for (const item of aiItems) {
    aiByItemId.set(item.item_id, item);
    if (item.has_material) aiMaterialById.set(item.item_id, lineItemToMaterial(item));
    if (item.has_labor) aiLaborById.set(item.item_id, lineItemToLabor(item));
  }

  // Split sub items into overrides vs additions
  const overrideItems: SubBidItem[] = [];
  const addedItems: SubBidItem[] = [];
  if (data) {
    for (const item of data.items) {
      if (item.is_addition) {
        addedItems.push(item);
      } else {
        overrideItems.push(item);
      }
    }
  }

  // Material overrides: items where sub changed material pricing
  const materialOverrides = overrideItems.filter(
    i => i.material_unit_cost != null || i.material_extended_cost != null
  );

  // Labor overrides: items where sub changed labor pricing
  const laborOverrides = overrideItems.filter(
    i => i.labor_hours != null || i.labor_hourly_rate != null || i.labor_cost != null
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center py-12 gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Failed to load bid details</span>
          </div>
        )}
        {data && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                {data.submission.company_name}
                <Badge className="text-[10px] bg-accent/10 text-accent border-accent/20">
                  {tradeLabel(data.submission.trade)}
                </Badge>
              </DialogTitle>
              <DialogDescription className="sr-only">
                Detailed bid breakdown from {data.submission.company_name}
              </DialogDescription>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                <span>Contact: {data.submission.contact_name}</span>
                <span>Submitted: {new Date(data.submission.submitted_at).toLocaleDateString()}</span>
              </div>
            </DialogHeader>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="p-3 rounded-lg border border-border bg-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Materials</p>
                <p className="text-lg font-bold">{formatCurrency(data.submission.total_material)}</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Labor</p>
                <p className="text-lg font-bold">{formatCurrency(data.submission.total_labor)}</p>
              </div>
              <div className="p-3 rounded-lg border border-accent/30 bg-accent/5">
                <p className="text-[10px] text-accent uppercase tracking-wider mb-1">Total Bid</p>
                <p className="text-lg font-bold">{formatCurrency(data.submission.total_bid)}</p>
              </div>
            </div>

            {/* Sub Notes */}
            {data.submission.notes && (
              <div className="mt-4 p-3 rounded-lg border border-border bg-muted/20">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Bid Notes</p>
                <p className="text-xs text-foreground">{data.submission.notes}</p>
              </div>
            )}

            {/* Material Overrides */}
            {materialOverrides.length > 0 && (
              <div className="mt-5">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                  Material Price Changes ({materialOverrides.length})
                </h4>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Item</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">AI Unit Cost</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">Sub Unit Cost</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">Delta</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materialOverrides.map(item => {
                        const aiMat = aiMaterialById.get(item.item_id);
                        const aiCost = aiMat?.unitCost ?? 0;
                        const subCost = item.material_unit_cost ?? aiCost;
                        const delta = subCost - aiCost;
                        return (
                          <tr key={item.item_id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2">
                              <span className="font-medium">{aiMat?.materialName || aiByItemId.get(item.item_id)?.material_description || aiByItemId.get(item.item_id)?.description || item.item_id}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatCurrencyDetailed(aiCost)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold">{formatCurrencyDetailed(subCost)}</td>
                            <td className={`px-3 py-2 text-right font-mono ${delta > 0 ? "text-destructive" : delta < 0 ? "text-success" : "text-muted-foreground"}`}>
                              {delta > 0 ? "+" : ""}{formatCurrencyDetailed(delta)}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[150px] truncate">{item.notes ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Labor Overrides */}
            {laborOverrides.length > 0 && (
              <div className="mt-5">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                  Labor Changes ({laborOverrides.length})
                </h4>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Item</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">AI Hours</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">Sub Hours</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">AI Rate</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">Sub Rate</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">Sub Cost</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laborOverrides.map(item => {
                        const aiLab = aiLaborById.get(item.item_id);
                        const aiHours = aiLab?.hours ?? 0;
                        const aiRate = aiLab?.hourlyRate ?? 0;
                        return (
                          <tr key={item.item_id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2">
                              <span className="font-medium">{aiLab?.description || item.item_id}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{aiHours}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold">{item.labor_hours ?? aiHours}</td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatCurrencyDetailed(aiRate)}/hr</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold">{formatCurrencyDetailed(item.labor_hourly_rate ?? aiRate)}/hr</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold">{formatCurrency(item.labor_cost ?? 0)}</td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[150px] truncate">{item.notes ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-Added Items */}
            {addedItems.length > 0 && (
              <div className="mt-5">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Plus className="w-3 h-3" />
                  Items Added by Sub ({addedItems.length})
                </h4>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Description</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">Qty</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Unit</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">Material Cost</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">Labor Cost</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {addedItems.map((item, i) => (
                        <tr key={`${item.item_id}-${i}`} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-medium">{item.description || item.item_id}</td>
                          <td className="px-3 py-2 text-right font-mono">{item.quantity ?? 1}</td>
                          <td className="px-3 py-2 text-muted-foreground">{item.unit ?? "ea"}</td>
                          <td className="px-3 py-2 text-right font-mono">{item.material_extended_cost != null ? formatCurrency(item.material_extended_cost) : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">{item.labor_cost != null ? formatCurrency(item.labor_cost) : "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[150px] truncate">{item.notes ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* No changes message */}
            {materialOverrides.length === 0 && laborOverrides.length === 0 && addedItems.length === 0 && (
              <div className="mt-5 text-center py-8 text-muted-foreground text-sm">
                This subcontractor submitted totals only — no per-item changes.
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
