import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TRADES } from "@/lib/constants";
import {
  listSubcontractors,
  createSubcontractor,
  updateSubcontractor,
  deleteSubcontractor,
} from "@/lib/api";
import type { Subcontractor } from "@/types";
import { Plus, X, Pencil, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

function tradeLabel(value: string): string {
  const found = TRADES.find(t => t.value === value);
  return found ? found.label : value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const TRADE_OPTIONS = TRADES.filter(t => t.value !== "general_contractor");

export default function SubcontractorManager() {
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);

  const fetchSubs = useCallback(async () => {
    try {
      const data = await listSubcontractors();
      setSubs(data);
    } catch {
      // Silent on first load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setCompanyName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setSelectedTrades([]);
  };

  const startEdit = (sub: Subcontractor) => {
    setEditingId(sub.id);
    setCompanyName(sub.company_name);
    setContactName(sub.contact_name);
    setEmail(sub.email);
    setPhone(sub.phone || "");
    setSelectedTrades(sub.trades || []);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!companyName.trim() || !contactName.trim() || !email.trim()) return;
    setSaving(true);
    try {
      const data = {
        company_name: companyName.trim(),
        contact_name: contactName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        trades: selectedTrades,
      };

      if (editingId) {
        await updateSubcontractor(editingId, data);
        toast.success("Subcontractor updated");
      } else {
        await createSubcontractor(data);
        toast.success("Subcontractor added");
      }
      resetForm();
      fetchSubs();
    } catch (err: any) {
      const msg = err?.status === 409
        ? "A subcontractor with this email already exists"
        : "Failed to save subcontractor";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sub: Subcontractor) => {
    try {
      await deleteSubcontractor(sub.id);
      toast.success(`Removed ${sub.company_name}`);
      fetchSubs();
    } catch {
      toast.error("Failed to delete subcontractor");
    }
  };

  const toggleTrade = (trade: string) => {
    setSelectedTrades(prev =>
      prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]
    );
  };

  return (
    <Card className="p-6 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Subcontractors</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Save subcontractor contacts to quickly send bid requests from your estimates.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)} className="h-8 gradient-accent text-accent-foreground">
            <Plus className="w-3.5 h-3.5 mr-1" />Add
          </Button>
        )}
      </div>

      {/* Existing contacts */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : subs.length > 0 ? (
        <div className="space-y-2 mb-4">
          {subs.map(sub => (
            <div key={sub.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{sub.company_name}</p>
                <p className="text-xs text-muted-foreground truncate">{sub.contact_name} · {sub.email}</p>
                {sub.trades.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {sub.trades.map(t => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{tradeLabel(t)}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => startEdit(sub)} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(sub)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : !showForm ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No subcontractors saved yet.</p>
      ) : null}

      {/* Add/Edit form */}
      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">Company Name</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="ABC Electric" className="mt-0.5 h-9" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Contact Name</Label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="John Smith" className="mt-0.5 h-9" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@abcelectric.com" className="mt-0.5 h-9" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Phone (optional)</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" className="mt-0.5 h-9" />
            </div>
          </div>

          <div>
            <Label className="text-[10px] text-muted-foreground mb-1.5 block">Trades</Label>
            <div className="flex flex-wrap gap-1.5">
              {TRADE_OPTIONS.map(t => {
                const isSelected = selectedTrades.includes(t.value);
                return (
                  <button
                    key={t.value}
                    onClick={() => toggleTrade(t.value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving || !companyName.trim() || !contactName.trim() || !email.trim()} className="h-8 gradient-accent text-accent-foreground">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              {editingId ? "Update" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm} className="h-8">Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
