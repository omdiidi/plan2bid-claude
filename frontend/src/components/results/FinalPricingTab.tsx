import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";

interface Props {
  materialSubtotal: number;
  laborSubtotal: number;
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
}

export default function FinalPricingTab({
  materialSubtotal,
  laborSubtotal,
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
}: Props) {
  const directCost = materialSubtotal + laborSubtotal;

  // When per-item markup data exists, use it; otherwise fall back to global markup
  const hasPerItemMarkup = clientMaterialSubtotal != null || clientLaborSubtotal != null;
  const clientMat = clientMaterialSubtotal ?? materialSubtotal;
  const clientLab = clientLaborSubtotal ?? laborSubtotal;
  const clientSubtotal = hasPerItemMarkup
    ? clientMat + clientLab
    : directCost + directCost * (markupPercent / 100);

  const totalMarkup = clientSubtotal - directCost;
  const avgMarkupPct = directCost > 0 ? (totalMarkup / directCost) * 100 : 0;

  const taxAmt = (clientMaterialSubtotal ?? materialSubtotal) * ((taxPercent ?? 0) / 100);
  const overheadAmt = directCost * (overheadPercent / 100);
  const contingencyAmt = directCost * (contingencyPercent / 100);
  const bidTotal = clientSubtotal + taxAmt + overheadAmt + contingencyAmt;
  const margin = bidTotal - directCost;
  const marginPct = directCost > 0 ? (margin / directCost) * 100 : 0;

  const matChanged = materialSubtotal !== originalMaterialSubtotal;
  const labChanged = laborSubtotal !== originalLaborSubtotal;

  return (
    <div className="p-6 space-y-1">
      {/* YOUR COSTS */}
      <div className="space-y-3">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your Costs</h4>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Materials</span>
          <div className="text-right">
            <span className="text-sm font-mono font-medium text-foreground">{formatCurrency(materialSubtotal)}</span>
            {matChanged && (
              <span className="text-[10px] text-muted-foreground ml-2">(was {formatCurrency(originalMaterialSubtotal)})</span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Labor</span>
          <div className="text-right">
            <span className="text-sm font-mono font-medium text-foreground">{formatCurrency(laborSubtotal)}</span>
            {labChanged && (
              <span className="text-[10px] text-muted-foreground ml-2">(was {formatCurrency(originalLaborSubtotal)})</span>
            )}
          </div>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Direct Cost</span>
          <span className="text-sm font-mono font-bold text-foreground">{formatCurrency(directCost)}</span>
        </div>
      </div>

      {/* CLIENT COSTS */}
      {hasPerItemMarkup && (
        <div className="pt-4 space-y-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Client Costs</h4>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Materials</span>
            <span className="text-sm font-mono font-medium text-foreground">{formatCurrency(clientMat)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Labor</span>
            <span className="text-sm font-mono font-medium text-foreground">{formatCurrency(clientLab)}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Client Subtotal</span>
            <span className="text-sm font-mono font-bold text-foreground">{formatCurrency(clientSubtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Markup</span>
            <span className="text-sm font-mono text-foreground">
              {formatCurrency(totalMarkup)} <span className="text-[10px] text-muted-foreground">({avgMarkupPct.toFixed(1)}% avg)</span>
            </span>
          </div>
        </div>
      )}

      {/* PROJECT SETTINGS */}
      <div className="pt-4 space-y-3">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Project Settings</h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Default Markup</span>
            <div className="flex items-center gap-1">
              <Input type="number" min={0} max={100} step={0.5} value={markupPercent} onChange={e => onMarkupChange(parseFloat(e.target.value) || 0)} className="h-7 w-16 text-xs font-mono text-center" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          {!hasPerItemMarkup && (
            <span className="text-sm font-mono text-foreground">+ {formatCurrency(totalMarkup)}</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground -mt-1">Used for items without a per-item markup override.</p>
        {taxPercent != null && onTaxChange && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Materials Tax</span>
              <div className="flex items-center gap-1">
                <Input type="number" min={0} max={20} step={0.01} value={taxPercent} onChange={e => onTaxChange(parseFloat(e.target.value) || 0)} className="h-7 w-16 text-xs font-mono text-center" />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <span className="text-sm font-mono text-foreground">+ {formatCurrency(taxAmt)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Overhead</span>
            <div className="flex items-center gap-1">
              <Input type="number" min={0} max={100} step={0.5} value={overheadPercent} onChange={e => onOverheadChange(parseFloat(e.target.value) || 0)} className="h-7 w-16 text-xs font-mono text-center" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <span className="text-sm font-mono text-foreground">+ {formatCurrency(overheadAmt)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Contingency</span>
            <div className="flex items-center gap-1">
              <Input type="number" min={0} max={100} step={0.5} value={contingencyPercent} onChange={e => onContingencyChange(parseFloat(e.target.value) || 0)} className="h-7 w-16 text-xs font-mono text-center" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <span className="text-sm font-mono text-foreground">+ {formatCurrency(contingencyAmt)}</span>
        </div>
      </div>

      {/* BID TOTAL + MARGIN */}
      <div className="pt-4">
        <Separator />
        <div className="flex items-center justify-between pt-4">
          <span className="text-lg font-extrabold text-foreground">Bid Total</span>
          <span className="text-2xl font-extrabold text-accent font-mono">{formatCurrency(bidTotal)}</span>
        </div>
        {hasPerItemMarkup && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-muted-foreground">Your Margin</span>
            <span className="text-sm font-mono font-semibold text-foreground">
              {formatCurrency(margin)} <span className="text-[10px] text-muted-foreground">({marginPct.toFixed(1)}%)</span>
            </span>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">Per-project percentages — saved automatically.</p>
      </div>
    </div>
  );
}
