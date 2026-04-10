import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, RefreshCw, Sparkles, FileText, Users, AlertTriangle, Building2, Briefcase, Loader2 } from "lucide-react";
import { getOverallSummary } from "@/lib/api";
import type { OverallSummary } from "@/types";

interface Props {
  projectId: string;
}

export default function ProjectSummaryCard({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<OverallSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async (regenerate = false) => {
    try {
      if (regenerate) setRegenerating(true);
      else setLoading(true);
      const res = await getOverallSummary(projectId, regenerate);
      setSummary(res.summary);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [projectId]);

  if (loading) {
    return (
      <Card className="shadow-card p-6 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading project summary...</span>
      </Card>
    );
  }

  if (error || !summary) {
    return (
      <Card className="shadow-card p-6">
        <p className="text-sm text-muted-foreground">{error || "Project summary not available."}</p>
      </Card>
    );
  }

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
                    <Sparkles className="w-3 h-3" />Generated summary
                  </Badge>
                  <Badge className="text-[10px] bg-accent/10 text-accent border-accent/20 hover:bg-accent/15">{d.classification}</Badge>
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-foreground leading-snug">{d.headline}</h2>
              </div>
              <div className="flex items-center gap-2 shrink-0 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  disabled={regenerating}
                  onClick={(e) => { e.stopPropagation(); fetchSummary(true); }}
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${regenerating ? "animate-spin" : ""}`} />Regenerate
                </Button>
                {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-5">
            {/* Building Info */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="w-3.5 h-3.5" />{d.building_info?.facility_type ?? "—"}
              </span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Briefcase className="w-3.5 h-3.5" />{d.building_info?.project_type ?? "—"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{d.building_info?.description ?? ""}</p>

            {/* Document Set */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm text-foreground font-medium">{d.document_set?.total_documents ?? 0} documents / {d.document_set?.total_pages ?? 0} pages</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(d.document_set?.key_doc_types ?? []).map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] font-mono font-normal">{t}</Badge>
                ))}
              </div>
            </div>

            {/* Trades In Scope */}
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Trades in Scope</h4>
              <div className="flex flex-wrap gap-1.5">
                {(d.trades_in_scope ?? []).map((t) => (
                  <Badge key={t} className="text-[11px] bg-accent/10 text-accent border-accent/20 hover:bg-accent/15">{t}</Badge>
                ))}
              </div>
            </div>

            {/* Key Constraints */}
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-warning" />Key Constraints
              </h4>
              <ul className="space-y-1.5">
                {(d.key_constraints ?? []).map((c, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full bg-warning mt-2 shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            {/* Parties */}
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Users className="w-3 h-3 text-muted-foreground" />Parties
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {(d.parties ?? []).map((p) => (
                  <div key={p.role} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{p.role}:</span>
                    <span className="text-foreground font-medium">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Narrative */}
            <div className="pt-2 border-t border-border">
              <p className="text-sm text-muted-foreground leading-relaxed italic">{d.narrative}</p>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
