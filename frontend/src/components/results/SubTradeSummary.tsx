import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp, Sparkles, HardHat, Clock, DollarSign, MapPin, AlertTriangle, Info, ShieldCheck, ListChecks } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { TradeSummary } from "@/types";

interface Props {
  summary: TradeSummary;
}

export default function SubTradeSummary({ summary }: Props) {
  const [open, setOpen] = useState(false);
  const d = summary;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="shadow-card overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full text-left p-5 sm:p-6 hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant="outline" className="text-[10px] gap-1 font-normal text-muted-foreground border-border">
                    <Sparkles className="w-3 h-3" />Trade summary
                  </Badge>
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-foreground leading-snug">{d.headline}</h2>
              </div>
              {open ? <ChevronUp className="w-4 h-4 text-muted-foreground mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground mt-1" />}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-5">
            <p className="text-sm text-muted-foreground leading-relaxed">{d.scope_overview}</p>

            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Key Quantities</h4>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-[11px] font-semibold">Description</TableHead>
                      <TableHead className="text-[11px] font-semibold text-right w-24">Qty</TableHead>
                      <TableHead className="text-[11px] font-semibold text-right w-16">Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(d.key_quantities ?? []).map((q, i) => (
                      <TableRow key={i} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                        <TableCell className="text-sm py-2">{q.description}</TableCell>
                        <TableCell className="text-sm py-2 text-right font-mono">{(q.quantity ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-sm py-2 text-right text-muted-foreground">{q.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <HardHat className="w-3 h-3 text-warning" />Site Conditions
              </h4>
              <ul className="space-y-1.5">
                {(d.site_conditions ?? []).map((c, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-warning mt-0.5 shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Labor Snapshot</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Total Hours</span>
                  </div>
                  <p className="text-lg font-bold font-mono text-foreground">{(d.labor_snapshot?.total_hours_expected ?? 0).toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <DollarSign className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Expected Cost</span>
                  </div>
                  <p className="text-lg font-bold font-mono text-foreground">{formatCurrency(d.labor_snapshot?.total_cost_expected ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Range</span>
                  </div>
                  <p className="text-sm font-mono text-foreground">{formatCurrency(d.labor_snapshot?.total_cost_low ?? 0)} — {formatCurrency(d.labor_snapshot?.total_cost_high ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">BLS Area</span>
                  </div>
                  <p className="text-xs text-foreground leading-tight">{d.labor_snapshot?.bls_area ?? "—"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {(d.labor_snapshot?.crew_roles ?? []).map((r) => (
                  <Badge key={r} variant="secondary" className="text-[10px] font-normal">{r}</Badge>
                ))}
              </div>
            </div>

            {(d.anomalies ?? []).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Anomalies</h4>
                <div className="space-y-2">
                  {(d.anomalies ?? []).filter(a => a.type === "priced_in").map((a, i) => (
                    <div key={i} className="text-sm text-foreground pl-3 py-2 border-l-2 border-warning bg-warning/5 rounded-r-md">
                      <span className="text-[10px] font-semibold uppercase text-warning mr-2">Priced In</span>
                      {a.description}
                    </div>
                  ))}
                  {(d.anomalies ?? []).filter(a => a.type === "noted").map((a, i) => (
                    <div key={i} className="text-sm text-foreground pl-3 py-2 border-l-2 border-accent bg-accent/5 rounded-r-md">
                      <span className="text-[10px] font-semibold uppercase text-accent mr-2">Noted</span>
                      {a.description}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-muted-foreground" />Confidence
              </h4>
              <div className="flex items-center gap-4 text-sm mb-1.5">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-confidence-high" />{d.confidence_summary?.high ?? 0} high</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-confidence-medium" />{d.confidence_summary?.medium ?? 0} medium</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-confidence-low" />{d.confidence_summary?.low ?? 0} low</span>
              </div>
              <p className="text-sm text-muted-foreground">{d.confidence_summary?.overall_assessment ?? ""}</p>
            </div>

            {(d.assumptions ?? []).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ListChecks className="w-3 h-3 text-muted-foreground" />Assumptions
                </h4>
                <ul className="space-y-1.5">
                  {(d.assumptions ?? []).map((a, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
