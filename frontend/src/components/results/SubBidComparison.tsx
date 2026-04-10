import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/utils";
import { getTradeSubBids } from "@/lib/api";
import type { SubBid, EstimateLineItem } from "@/types";
import { ChevronDown, ChevronUp, Users, Trophy, Loader2, Eye } from "lucide-react";
import SubBidDetailModal from "./SubBidDetailModal";

interface Props {
  projectId: string;
  trade: string;
  aiEstimateTotal: number;
  tradeItems?: EstimateLineItem[];
}

export default function SubBidComparison({ projectId, trade, aiEstimateTotal, tradeItems }: Props) {
  const [bids, setBids] = useState<SubBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [detailBidId, setDetailBidId] = useState<number | null>(null);

  const fetchBids = useCallback(async () => {
    try {
      const data = await getTradeSubBids(projectId, trade);
      setBids(data);
    } catch {
      // Silent — no bids yet
    } finally {
      setLoading(false);
    }
  }, [projectId, trade]);

  useEffect(() => { fetchBids(); }, [fetchBids]);

  if (loading || bids.length === 0) return null;

  const sorted = [...bids].sort((a, b) => a.total_bid - b.total_bid);
  const lowest = sorted[0];

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card className="shadow-card overflow-hidden">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-5 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-foreground">
                  Subcontractor Bids ({bids.length})
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  Lowest: {formatCurrency(lowest.total_bid)}
                </Badge>
              </div>
              {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-5 pb-5">
              {/* Header row */}
              <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wider pb-2 border-b border-border">
                <span>Company</span>
                <div className="flex gap-8">
                  <span className="w-24 text-right">Materials</span>
                  <span className="w-24 text-right">Labor</span>
                  <span className="w-28 text-right">Total Bid</span>
                  <span className="w-20 text-right">vs AI</span>
                  <span className="w-16"></span>
                </div>
              </div>

              {/* Bid rows */}
              <div className="space-y-0">
                {sorted.map((bid, i) => {
                  const delta = bid.total_bid - aiEstimateTotal;
                  const deltaPercent = aiEstimateTotal > 0 ? (delta / aiEstimateTotal) * 100 : 0;
                  const isLowest = i === 0;

                  return (
                    <div
                      key={bid.id}
                      className={`flex items-center justify-between py-3 border-b border-border last:border-0 ${isLowest ? "bg-accent/5" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        {isLowest && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
                        <div>
                          <p className="text-sm font-medium text-foreground">{bid.company_name}</p>
                          <p className="text-xs text-muted-foreground">{bid.contact_name}</p>
                        </div>
                      </div>
                      <div className="flex gap-8 items-center">
                        <span className="w-24 text-right text-sm font-mono text-muted-foreground">
                          {formatCurrency(bid.total_material)}
                        </span>
                        <span className="w-24 text-right text-sm font-mono text-muted-foreground">
                          {formatCurrency(bid.total_labor)}
                        </span>
                        <span className="w-28 text-right text-sm font-mono font-semibold text-foreground">
                          {formatCurrency(bid.total_bid)}
                        </span>
                        <span className={`w-20 text-right text-xs font-mono ${delta > 0 ? "text-destructive" : "text-success"}`}>
                          {delta > 0 ? "+" : ""}{deltaPercent.toFixed(1)}%
                        </span>
                        <span className="w-16 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-accent gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailBidId(bid.id);
                            }}
                          >
                            <Eye className="w-3 h-3" />
                            Details
                          </Button>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* AI estimate reference */}
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">AI Estimate (reference)</span>
                <span className="text-sm font-mono text-muted-foreground">{formatCurrency(aiEstimateTotal)}</span>
              </div>
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
        aiItems={tradeItems}
      />
    </>
  );
}
