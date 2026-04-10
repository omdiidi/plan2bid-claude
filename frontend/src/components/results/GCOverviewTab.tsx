import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, Users, FileText, Send } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { TRADES } from "@/lib/constants";
import ProjectSummaryCard from "./ProjectSummaryCard";
import FinalPricingTab from "./FinalPricingTab";
import SendToSubModal from "./SendToSubModal";
import GCOverviewSubBids from "./GCOverviewSubBids";
import type { CostSummary, EstimateLineItem } from "@/types";

interface Props {
  projectId: string;
  tradeSubtotals?: Record<string, CostSummary>;
  displayMaterialSubtotal: number;
  displayLaborSubtotal: number;
  originalMaterialSubtotal: number;
  originalLaborSubtotal: number;
  clientMaterialSubtotal?: number | null;
  clientLaborSubtotal?: number | null;
  markupPercent: number;
  overheadPercent: number;
  contingencyPercent: number;
  onMarkupChange: (v: number) => void;
  onOverheadChange: (v: number) => void;
  onContingencyChange: (v: number) => void;
  taxPercent?: number;
  onTaxChange?: (v: number) => void;
  tradeSections?: Record<string, EstimateLineItem[]>;
}

function tradeLabel(value: string): string {
  const found = TRADES.find(t => t.value === value);
  return found ? found.label : value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function GCOverviewTab({
  projectId,
  tradeSubtotals,
  displayMaterialSubtotal,
  displayLaborSubtotal,
  originalMaterialSubtotal,
  originalLaborSubtotal,
  clientMaterialSubtotal,
  clientLaborSubtotal,
  markupPercent,
  overheadPercent,
  contingencyPercent,
  onMarkupChange,
  onOverheadChange,
  onContingencyChange,
  taxPercent,
  onTaxChange,
  tradeSections,
}: Props) {
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const grandTotal = displayMaterialSubtotal + displayLaborSubtotal;
  const availableTrades = tradeSubtotals ? Object.keys(tradeSubtotals) : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Project Summary */}
      <ProjectSummaryCard projectId={projectId} />

      {/* Aggregate Cost Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="p-5 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Materials Subtotal</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(displayMaterialSubtotal)}</p>
        </Card>
        <Card className="p-5 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Labor Subtotal</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(displayLaborSubtotal)}</p>
        </Card>
        <Card className="p-5 shadow-card border-2 border-accent/30">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-accent" />
            <span className="text-sm text-accent font-medium">Grand Total</span>
          </div>
          <p className="text-3xl font-extrabold text-foreground">{formatCurrency(grandTotal)}</p>
        </Card>
      </div>

      {/* Per-trade cost breakdown */}
      {tradeSubtotals && Object.keys(tradeSubtotals).length > 0 && (
        <Card className="shadow-card p-5">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Cost by Trade</h3>
          <div className="space-y-2">
            {Object.entries(tradeSubtotals).map(([trade, costs]) => (
              <div key={trade} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  <Badge className="text-[11px] bg-accent/10 text-accent border-accent/20">{tradeLabel(trade)}</Badge>
                </div>
                <div className="flex items-center gap-3 sm:gap-6 text-sm font-mono">
                  <span className="text-muted-foreground">{formatCurrency(costs.materials_subtotal)}</span>
                  <span className="text-muted-foreground">{formatCurrency(costs.labor_subtotal)}</span>
                  <span className="font-semibold text-foreground">{formatCurrency(costs.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Subcontractor Bids (all trades) */}
      <GCOverviewSubBids projectId={projectId} tradeSubtotals={tradeSubtotals} tradeSections={tradeSections} />

      {/* Final Pricing */}
      <Card className="shadow-card overflow-hidden">
        <FinalPricingTab
          materialSubtotal={displayMaterialSubtotal}
          laborSubtotal={displayLaborSubtotal}
          originalMaterialSubtotal={originalMaterialSubtotal}
          originalLaborSubtotal={originalLaborSubtotal}
          clientMaterialSubtotal={clientMaterialSubtotal}
          clientLaborSubtotal={clientLaborSubtotal}
          markupPercent={markupPercent}
          overheadPercent={overheadPercent}
          contingencyPercent={contingencyPercent}
          onMarkupChange={onMarkupChange}
          onOverheadChange={onOverheadChange}
          onContingencyChange={onContingencyChange}
          taxPercent={taxPercent}
          onTaxChange={onTaxChange}
        />
      </Card>

      {/* Send to Subcontractor */}
      <Card className="shadow-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Send className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-foreground">Send to Subcontractor</h3>
            </div>
            <p className="text-xs text-muted-foreground">Send per-trade bid packages to subcontractors for competitive pricing.</p>
          </div>
          <Button onClick={() => setSendModalOpen(true)} className="gradient-accent text-accent-foreground">
            <Send className="w-3.5 h-3.5 mr-1.5" />Send Bid Request
          </Button>
        </div>
      </Card>

      <SendToSubModal
        open={sendModalOpen}
        onOpenChange={setSendModalOpen}
        projectId={projectId}
        availableTrades={availableTrades}
      />
    </div>
  );
}
