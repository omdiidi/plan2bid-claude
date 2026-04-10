import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/utils";
import { getSubBids } from "@/lib/api";
import { TRADES } from "@/lib/constants";
import type { SubBid, CostSummary, EstimateLineItem } from "@/types";
import { ChevronDown, ChevronUp, Users, Trophy, Eye } from "lucide-react";
import SubBidDetailModal from "./SubBidDetailModal";

interface Props {
  projectId: string;
  tradeSubtotals?: Record<string, CostSummary>;
  tradeSections?: Record<string, EstimateLineItem[]>;
}

function tradeLabel(value: string): string {
  const found = TRADES.find(t => t.value === value);
  return found ? found.label : value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function GCOverviewSubBids({ projectId, tradeSubtotals, tradeSections }: Props) {
  const [bidsByTrade, setBidsByTrade] = useState<Record<string, SubBid[]>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [detailBidId, setDetailBidId] = useState<number | null>(null);
  const [detailTrade, setDetailTrade] = useState<string>("");

  useEffect(() => {
    getSubBids(projectId)
      .then(data => setBidsByTrade(data.bids_by_trade ?? {}))
      .catch((err) => { console.warn("Failed to fetch sub bids:", err); })
      .finally(() => setLoading(false));
  }, [projectId]);

  const totalBids = Object.values(bidsByTrade).reduce((sum, arr) => sum + arr.length, 0);

  if (loading || totalBids === 0) return null;

  // Flatten for finding global lowest
  const allBids: (SubBid & { _trade: string })[] = [];
  for (const [trade, bids] of Object.entries(bidsByTrade)) {
    for (const bid of bids) {
      allBids.push({ ...bid, _trade: trade });
    }
  }

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card className="shadow-card overflow-hidden">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-5 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-foreground">
                  Subcontractor Bids ({totalBids})
                </span>
              </div>
              {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-5 pb-5">
              {Object.entries(bidsByTrade).map(([trade, bids]) => {
                const sorted = [...bids].sort((a, b) => a.total_bid - b.total_bid);
                const aiTotal = tradeSubtotals?.[trade]?.total ?? 0;

                return (
                  <div key={trade} className="mb-4 last:mb-0">
                    {/* Trade header */}
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="text-[10px] bg-accent/10 text-accent border-accent/20">{tradeLabel(trade)}</Badge>
                      <span className="text-[10px] text-muted-foreground">{bids.length} bid{bids.length !== 1 ? "s" : ""}</span>
                    </div>

                    {/* Header row */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider pb-1.5 border-b border-border">
                      <span>Company</span>
                      <div className="flex gap-6">
                        <span className="w-20 text-right">Materials</span>
                        <span className="w-20 text-right">Labor</span>
                        <span className="w-24 text-right">Total Bid</span>
                        <span className="w-16 text-right">vs AI</span>
                        <span className="w-14"></span>
                      </div>
                    </div>

                    {/* Bid rows */}
                    {sorted.map((bid, i) => {
                      const delta = bid.total_bid - aiTotal;
                      const deltaPercent = aiTotal > 0 ? (delta / aiTotal) * 100 : 0;
                      const isLowest = i === 0;

                      return (
                        <div
                          key={bid.id}
                          className={`flex items-center justify-between py-2.5 border-b border-border last:border-0 ${isLowest ? "bg-accent/5" : ""}`}
                        >
                          <div className="flex items-center gap-2">
                            {isLowest && <Trophy className="w-3 h-3 text-warning" />}
                            <div>
                              <p className="text-xs font-medium text-foreground">{bid.company_name}</p>
                              <p className="text-[10px] text-muted-foreground">{bid.contact_name}</p>
                            </div>
                          </div>
                          <div className="flex gap-6 items-center">
                            <span className="w-20 text-right text-xs font-mono text-muted-foreground">
                              {formatCurrency(bid.total_material)}
                            </span>
                            <span className="w-20 text-right text-xs font-mono text-muted-foreground">
                              {formatCurrency(bid.total_labor)}
                            </span>
                            <span className="w-24 text-right text-xs font-mono font-semibold text-foreground">
                              {formatCurrency(bid.total_bid)}
                            </span>
                            <span className={`w-16 text-right text-[10px] font-mono ${delta > 0 ? "text-destructive" : "text-success"}`}>
                              {delta > 0 ? "+" : ""}{deltaPercent.toFixed(1)}%
                            </span>
                            <span className="w-14 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-accent gap-0.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailBidId(bid.id);
                                  setDetailTrade(trade);
                                }}
                              >
                                <Eye className="w-2.5 h-2.5" />
                                View
                              </Button>
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* AI reference for this trade */}
                    <div className="flex items-center justify-between pt-2 text-[10px] text-muted-foreground">
                      <span>AI Estimate</span>
                      <span className="font-mono">{formatCurrency(aiTotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Detail Modal */}
      <SubBidDetailModal
        open={detailBidId !== null}
        onOpenChange={(v) => { if (!v) setDetailBidId(null); }}
        projectId={projectId}
        submissionId={detailBidId ?? 0}
        aiItems={tradeSections?.[detailTrade]}
      />
    </>
  );
}
