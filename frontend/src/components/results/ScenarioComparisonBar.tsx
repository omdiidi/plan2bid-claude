import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ScenarioComparisonEntry } from "@/types";

interface ScenarioComparisonBarProps {
  scenarios: ScenarioComparisonEntry[];
  baseTotal: number;
  onSelectScenario: (id: string) => void;
  onCompareAll: () => void;
  onAddScenario: () => void;
}

export default function ScenarioComparisonBar({
  scenarios,
  baseTotal,
  onSelectScenario,
  onCompareAll,
  onAddScenario,
}: ScenarioComparisonBarProps) {
  if (scenarios.length === 0) return null;

  return (
    <Card className="shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Scenarios ({scenarios.length})</h3>
        <div className="flex items-center gap-2">
          {scenarios.length >= 2 && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onCompareAll}>
              <BarChart3 className="w-3 h-3" />Compare All
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onAddScenario}>
            <Plus className="w-3 h-3" />Add Scenario
          </Button>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {/* Base card */}
        <button className="shrink-0 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-left min-w-[140px] hover:bg-accent/10 transition-colors">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Base</p>
          <p className="text-sm font-mono font-bold text-foreground mt-0.5">{formatCurrency(baseTotal)}</p>
        </button>
        {/* Scenario cards */}
        {scenarios.map(s => {
          const delta = s.delta_from_base;
          return (
            <button
              key={s.id}
              className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-left min-w-[140px] hover:border-accent/40 transition-colors"
              onClick={() => onSelectScenario(s.id)}
            >
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{s.name}</p>
                <Badge
                  variant={s.status === "completed" ? "default" : s.status === "error" ? "destructive" : "secondary"}
                  className="text-[8px] px-1 py-0"
                >
                  {s.status === "completed" ? "Ready" : s.status === "running" ? "..." : s.status}
                </Badge>
              </div>
              {s.status === "completed" ? (
                <>
                  <p className="text-sm font-mono font-bold text-foreground mt-0.5">{formatCurrency(s.total)}</p>
                  <p className={`text-[10px] font-mono ${delta.total >= 0 ? "text-destructive" : "text-success"}`}>
                    {delta.total >= 0 ? "+" : ""}{formatCurrency(delta.total)} ({delta.percent >= 0 ? "+" : ""}{delta.percent.toFixed(1)}%)
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Generating...</p>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
