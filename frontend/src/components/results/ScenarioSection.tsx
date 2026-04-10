import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, GitBranch, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Scenario, ScenarioDelta } from "@/types";

interface ScenarioSectionProps {
  name: string;
  isBase?: boolean;
  scenario?: Scenario;
  delta?: ScenarioDelta | null;
  defaultOpen?: boolean;
  onSpinOff?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  running: { label: "Generating...", variant: "outline" },
  completed: { label: "Ready", variant: "default" },
  error: { label: "Failed", variant: "destructive" },
};

export default function ScenarioSection({
  name,
  isBase = false,
  scenario,
  delta,
  defaultOpen = true,
  onSpinOff,
  onDelete,
  children,
}: ScenarioSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const status = scenario?.status ?? "completed";
  const config = statusConfig[status] ?? statusConfig.completed;

  return (
    <Card className="shadow-card overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-5 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              {!isBase && <GitBranch className="w-4 h-4 text-accent" />}
              <span className="text-sm font-semibold text-foreground">{name}</span>
              {!isBase && <Badge variant={config.variant} className="text-[10px]">{config.label}</Badge>}
              {status === "running" && <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />}
              {status === "error" && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
            </div>
            <div className="flex items-center gap-3">
              {/* Delta badge */}
              {delta && status === "completed" && (
                <span className={`text-xs font-mono font-medium ${delta.total >= 0 ? "text-destructive" : "text-success"}`}>
                  {delta.total >= 0 ? "+" : ""}{formatCurrency(delta.total)} ({delta.percent >= 0 ? "+" : ""}{delta.percent.toFixed(1)}%)
                </span>
              )}
              {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {/* Scenario summary + actions bar */}
          {!isBase && scenario && (
            <div className="px-5 pb-3 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {scenario.summary && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{scenario.summary}</p>
                )}
                {scenario.reasoning && (
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1.5 border-l-2 border-accent/30 pl-2.5">
                    {scenario.reasoning}
                  </p>
                )}
                {scenario.error_message && (
                  <p className="text-xs text-destructive mt-1">{scenario.error_message}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onSpinOff && status === "completed" && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); onSpinOff(); }}>
                    <GitBranch className="w-3 h-3" />Spin Off
                  </Button>
                )}
                {onDelete && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          )}
          {/* Content */}
          {status === "completed" ? children : status === "running" ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 text-accent animate-spin" />
              <p className="text-sm text-muted-foreground">Generating scenario... {scenario?.progress ?? 0}%</p>
            </div>
          ) : status === "error" ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <AlertTriangle className="w-6 h-6 text-destructive" />
              <p className="text-sm text-muted-foreground">Scenario generation failed.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Waiting to generate...</p>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
