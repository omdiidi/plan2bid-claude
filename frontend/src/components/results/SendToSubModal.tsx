import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { TRADES } from "@/lib/constants";
import {
  listSubcontractors,
  createBidRequest,
  listBidRequests,
} from "@/lib/api";
import type { Subcontractor, BidInvite } from "@/types";
import { Copy, Check, Link2, Loader2, Send, Users, Eye, FileText } from "lucide-react";
import { toast } from "sonner";

function tradeLabel(value: string): string {
  const found = TRADES.find(t => t.value === value);
  return found ? found.label : value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  availableTrades: string[];
  defaultTrade?: string; // Pre-select if opened from a trade tab
}

export default function SendToSubModal({
  open,
  onOpenChange,
  projectId,
  availableTrades,
  defaultTrade,
}: Props) {
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [existingInvites, setExistingInvites] = useState<BidInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [competitiveView, setCompetitiveView] = useState(false);
  const [sendDocuments, setSendDocuments] = useState(false);
  const [selectedSubEmail, setSelectedSubEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [subsData, invitesData] = await Promise.all([
        listSubcontractors(),
        listBidRequests(projectId),
      ]);
      setSubs(subsData);
      setExistingInvites(invitesData);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      fetchData();
      setGeneratedLink("");
      setCopied(false);
      setSelectedTrades(defaultTrade ? [defaultTrade] : availableTrades);
    }
  }, [open, fetchData, defaultTrade, availableTrades]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const toggleTrade = (trade: string) => {
    setSelectedTrades(prev =>
      prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]
    );
  };

  const handleCreate = async () => {
    if (selectedTrades.length === 0) {
      toast.error("Select at least one trade");
      return;
    }
    setCreating(true);
    try {
      const res = await createBidRequest(projectId, {
        trades_scope: selectedTrades,
        allow_competitive_view: competitiveView,
        send_documents: sendDocuments,
        email: selectedSubEmail || undefined,
      });
      const url = `${window.location.origin}/bid/${res.token}`;
      setGeneratedLink(url);
      fetchData(); // Refresh invites list
      toast.success("Bid request created");
    } catch {
      toast.error("Failed to create bid request");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast.success("Link copied to clipboard");
  };

  // Filter saved subs that match the selected trades
  const matchingSubs = subs.filter(sub =>
    sub.trades.length === 0 || sub.trades.some(t => selectedTrades.includes(t))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            Send to Subcontractor
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Trade Scope Selection */}
            <div>
              <Label className="text-xs font-medium mb-2 block">Scope — which trades can they see?</Label>
              <div className="flex flex-wrap gap-1.5">
                {availableTrades.map(trade => {
                  const isSelected = selectedTrades.includes(trade);
                  return (
                    <button
                      key={trade}
                      onClick={() => toggleTrade(trade)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tradeLabel(trade)}
                    </button>
                  );
                })}
              </div>
              {selectedTrades.length === availableTrades.length && (
                <p className="text-[10px] text-muted-foreground mt-1">All trades selected</p>
              )}
            </div>

            <Separator />

            {/* Saved Subcontractor Quick-Pick */}
            {matchingSubs.length > 0 && (
              <div>
                <Label className="text-xs font-medium mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Pick from saved contacts
                </Label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {matchingSubs.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedSubEmail(sub.email === selectedSubEmail ? "" : sub.email)}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${
                        selectedSubEmail === sub.email
                          ? "bg-accent/10 border border-accent/30"
                          : "bg-muted/50 hover:bg-muted"
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                        {sub.company_name[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{sub.company_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{sub.email}</p>
                      </div>
                      {sub.trades.length > 0 && (
                        <div className="flex gap-1">
                          {sub.trades.filter(t => selectedTrades.includes(t)).map(t => (
                            <Badge key={t} variant="secondary" className="text-[9px]">{tradeLabel(t)}</Badge>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Or enter email manually */}
            <div>
              <Label className="text-xs font-medium mb-1.5 block">
                {matchingSubs.length > 0 ? "Or enter email manually" : "Subcontractor email (optional)"}
              </Label>
              <Input
                type="email"
                value={selectedSubEmail}
                onChange={e => setSelectedSubEmail(e.target.value)}
                placeholder="sub@example.com"
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Optional — you can also just copy the link and send it yourself.
              </p>
            </div>

            {/* Competitive View Toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-foreground">Competitive Pricing</p>
                  <p className="text-[10px] text-muted-foreground">Let subcontractors see other submitted bid totals</p>
                </div>
              </div>
              <Switch checked={competitiveView} onCheckedChange={setCompetitiveView} />
            </div>

            {/* Include Documents Toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-foreground">Include Documents</p>
                  <p className="text-[10px] text-muted-foreground">Let subcontractors view project plans and specs</p>
                </div>
              </div>
              <Switch checked={sendDocuments} onCheckedChange={setSendDocuments} />
            </div>

            {/* Generate Link */}
            {!generatedLink ? (
              <Button
                onClick={handleCreate}
                disabled={creating || selectedTrades.length === 0}
                className="w-full gradient-accent text-accent-foreground"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                Generate Bid Request Link
              </Button>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Bid Request Link</Label>
                <div className="flex gap-2">
                  <Input value={generatedLink} readOnly className="text-xs font-mono" />
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Send this link to the subcontractor. They can review and price the estimate, then submit their bid.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setGeneratedLink(""); setCopied(false); }}
                  className="w-full"
                >
                  Create Another
                </Button>
              </div>
            )}

            {/* Existing Invites */}
            {existingInvites.length > 0 && (
              <>
                <Separator />
                <div>
                  <Label className="text-xs font-medium mb-2 block">Active Bid Requests ({existingInvites.length})</Label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {existingInvites.map(inv => (
                      <div key={inv.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                        <div className="min-w-0 flex-1">
                          <div className="flex gap-1 mb-0.5">
                            {inv.trades_scope.map(t => (
                              <Badge key={t} variant="secondary" className="text-[9px]">{tradeLabel(t)}</Badge>
                            ))}
                          </div>
                          {inv.email && <p className="text-[10px] text-muted-foreground truncate">{inv.email}</p>}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={async () => {
                            const url = `${window.location.origin}/bid/${inv.token}`;
                            await navigator.clipboard.writeText(url);
                            toast.success("Link copied");
                          }}
                        >
                          <Copy className="w-3 h-3 mr-1" />Copy
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
