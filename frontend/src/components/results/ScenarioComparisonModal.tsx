import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import type { ScenarioComparison, ScenarioComparisonEntry } from "@/types";

interface ScenarioComparisonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comparison: ScenarioComparison | null;
}

function DeltaCell({ value, percent }: { value: number; percent?: number }) {
  if (value === 0) return <span className="text-xs text-muted-foreground font-mono">--</span>;
  const color = value > 0 ? "text-destructive" : "text-success";
  return (
    <span className={`text-xs font-mono ${color}`}>
      {value > 0 ? "+" : ""}{formatCurrency(value)}
      {percent !== undefined && <span className="text-[10px] ml-1">({percent >= 0 ? "+" : ""}{percent.toFixed(1)}%)</span>}
    </span>
  );
}

export default function ScenarioComparisonModal({
  open,
  onOpenChange,
  comparison,
}: ScenarioComparisonModalProps) {
  if (!comparison) return null;

  const completedScenarios = comparison.scenarios.filter(s => s.status === "completed");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scenario Comparison</DialogTitle>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground w-[140px]">Metric</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-accent">Base</th>
                {completedScenarios.map(s => (
                  <th key={s.id} className="text-right py-2 px-3 text-xs font-medium text-foreground max-w-[120px] truncate">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Materials */}
              <tr className="border-b border-border/50">
                <td className="py-2.5 pr-4 text-xs text-muted-foreground">Materials</td>
                <td className="py-2.5 px-3 text-right text-xs font-mono font-medium">{formatCurrency(comparison.base.materials_subtotal)}</td>
                {completedScenarios.map(s => (
                  <td key={s.id} className="py-2.5 px-3 text-right">
                    <div className="text-xs font-mono font-medium">{formatCurrency(s.materials_subtotal)}</div>
                    <DeltaCell value={s.delta_from_base.materials} />
                  </td>
                ))}
              </tr>
              {/* Labor */}
              <tr className="border-b border-border/50">
                <td className="py-2.5 pr-4 text-xs text-muted-foreground">Labor</td>
                <td className="py-2.5 px-3 text-right text-xs font-mono font-medium">{formatCurrency(comparison.base.labor_subtotal)}</td>
                {completedScenarios.map(s => (
                  <td key={s.id} className="py-2.5 px-3 text-right">
                    <div className="text-xs font-mono font-medium">{formatCurrency(s.labor_subtotal)}</div>
                    <DeltaCell value={s.delta_from_base.labor} />
                  </td>
                ))}
              </tr>
              {/* Total */}
              <tr>
                <td className="py-2.5 pr-4 text-sm font-semibold text-foreground">Total</td>
                <td className="py-2.5 px-3 text-right text-sm font-mono font-bold text-accent">{formatCurrency(comparison.base.total)}</td>
                {completedScenarios.map(s => (
                  <td key={s.id} className="py-2.5 px-3 text-right">
                    <div className="text-sm font-mono font-bold">{formatCurrency(s.total)}</div>
                    <DeltaCell value={s.delta_from_base.total} percent={s.delta_from_base.percent} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Summaries */}
        {completedScenarios.some(s => s.summary || s.reasoning) && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Summaries</h4>
              {completedScenarios.filter(s => s.summary || s.reasoning).map(s => (
                <div key={s.id} className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs font-medium text-foreground mb-1">{s.name}</p>
                  {s.summary && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.summary}</p>
                  )}
                  {s.reasoning && (
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1 border-l-2 border-accent/30 pl-2">
                      {s.reasoning}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
