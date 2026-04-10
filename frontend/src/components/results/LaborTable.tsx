import { useState, useMemo, useEffect, useRef } from "react";
import { LaborItem } from "@/lib/constants";
import { formatCurrency, formatCurrencyDetailed } from "@/lib/utils";
import { polishText } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, AlertTriangle, RotateCcw, ArrowUpDown, Clock, DollarSign, Tag, X, Sparkles, Trash2, Plus, ChevronsUp, Pencil, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PresetMatch, ItemOverride, ItemMarkup } from "@/types";
import type { LaborPreset } from "@/lib/app-context";

interface Props {
  items: LaborItem[];
  scrollToId?: string | null;
  laborPresets?: LaborPreset[];
  presetMatches?: PresetMatch[];
  initialOverrides?: Record<string, ItemOverride>;
  onOverridesChange?: (overrides: Record<string, ItemOverride>) => void;
  onSubtotalChange?: (subtotal: number) => void;
  onReviewAll?: () => void;
  dismissedMatches?: Set<string>;
  canEdit?: boolean;
  onDeleteItem?: (itemId: string) => void;
  onAddItem?: (item: { description: string; quantity: number; unit: string; hours: number; hourly_rate: number; preset_id?: string; preset_name?: string }) => void;
  markupOverrides?: Record<string, ItemMarkup>;
  defaultMarkupPercent?: number;
  onMarkupChange?: (itemId: string, markup: ItemMarkup) => void;
  onClientSubtotalChange?: (clientSubtotal: number) => void;
  onUpdateItem?: (itemId: string, updates: { description?: string }) => Promise<void>;
  onItemDataChange?: (items: Array<{ id: string; hours: number; rate: number; total: number }>) => void;
}

export default function LaborTable({
  items: rawItems,
  scrollToId,
  laborPresets = [],
  presetMatches = [],
  initialOverrides,
  onOverridesChange,
  onSubtotalChange,
  onReviewAll,
  dismissedMatches: externalDismissed,
  canEdit,
  onDeleteItem,
  onAddItem,
  markupOverrides,
  defaultMarkupPercent = 0,
  onMarkupChange,
  onClientSubtotalChange,
  onUpdateItem,
  onItemDataChange,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedRow, setExpandedRow] = useState<string | null>(scrollToId ?? null);
  const [overrides, setOverrides] = useState<Record<string, ItemOverride>>(initialOverrides ?? {});
  const [hourAdjustments, setHourAdjustments] = useState<Record<string, number>>({});
  const [rateAdjustments, setRateAdjustments] = useState<Record<string, number>>({});
  const syncingFromParent = useRef(false);
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());

  // Inline edit state
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [polishingName, setPolishingName] = useState(false);
  const dismissedMatches = externalDismissed
    ? new Set([...externalDismissed, ...localDismissed])
    : localDismissed;

  // Sync overrides from parent
  useEffect(() => {
    if (initialOverrides) {
      syncingFromParent.current = true;
      setOverrides(initialOverrides);
    }
  }, [initialOverrides]);

  // Build match lookup
  const matchByItemId = useMemo(() => {
    const map = new Map<string, PresetMatch>();
    for (const m of presetMatches) {
      if (!dismissedMatches.has(m.item_id)) map.set(m.item_id, m);
    }
    return map;
  }, [presetMatches, dismissedMatches]);

  // Preset lookup
  const presetById = useMemo(() => {
    const map = new Map<string, LaborPreset>();
    for (const p of laborPresets) map.set(p.id, p);
    return map;
  }, [laborPresets]);

  // Compute adjusted values for ALL items (pre-filter/sort) — used by onItemDataChange
  const allComputedItems = useMemo(() => {
    return rawItems.map(item => {
      const override = overrides[item.id];
      const hours = hourAdjustments[item.id] ?? item.hoursExpected;
      const rate = override ? override.override_value : (rateAdjustments[item.id] ?? item.rateExpected);
      const total = hours * rate;
      return { ...item, hours, hourlyRate: rate, total };
    });
  }, [rawItems, overrides, hourAdjustments, rateAdjustments]);

  const items = useMemo(() => {
    return allComputedItems
      .filter(item => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return item.description.toLowerCase().includes(q) || item.id.toLowerCase().includes(q) || item.crew.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        switch (sortField) {
          case "description": return a.description.localeCompare(b.description) * dir;
          case "total": return (a.total - b.total) * dir;
          case "hours": return (a.hours - b.hours) * dir;
          case "confidence": {
            const order = { high: 0, medium: 1, low: 2 };
            return (order[a.confidence] - order[b.confidence]) * dir;
          }
          default: return a.id.localeCompare(b.id) * dir;
        }
      });
  }, [allComputedItems, searchQuery, sortField, sortDir]);

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const totalHours = items.reduce((s, i) => s + i.hours, 0);
  const hasAdjustments = Object.keys(overrides).length > 0 || Object.keys(hourAdjustments).length > 0 || Object.keys(rateAdjustments).length > 0;

  // Compute per-item markup and client costs
  const itemsWithMarkup = useMemo(() => {
    return items.map(item => {
      const mkPct = markupOverrides?.[item.id]?.markupPercent ?? defaultMarkupPercent;
      const markupAmt = item.total * (mkPct / 100);
      const clientCost = item.total + markupAmt;
      return { ...item, markupPercent: mkPct, markupAmt, clientCost };
    });
  }, [items, markupOverrides, defaultMarkupPercent]);

  const clientSubtotal = itemsWithMarkup.reduce((s, i) => s + i.clientCost, 0);

  // Propagate subtotal changes
  useEffect(() => {
    onSubtotalChange?.(subtotal);
  }, [subtotal, onSubtotalChange]);

  // Propagate client subtotal changes
  useEffect(() => {
    onClientSubtotalChange?.(clientSubtotal);
  }, [clientSubtotal, onClientSubtotalChange]);

  // Propagate computed item data (all items including search-hidden)
  useEffect(() => {
    onItemDataChange?.(allComputedItems.map(i => ({ id: i.id, hours: i.hours, rate: i.hourlyRate, total: i.total })));
  }, [allComputedItems, onItemDataChange]);

  // Propagate override changes (skip when syncing from parent to avoid infinite loop)
  useEffect(() => {
    if (syncingFromParent.current) {
      syncingFromParent.current = false;
      return;
    }
    onOverridesChange?.(overrides);
  }, [overrides, onOverridesChange]);

  const unresolvedMatchCount = presetMatches.filter(
    m => !dismissedMatches.has(m.item_id) && !overrides[m.item_id]
  ).length;

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const applyPreset = (itemId: string, preset: LaborPreset) => {
    const item = rawItems.find(i => i.id === itemId);
    if (!item) return;
    const newOverrides = {
      ...overrides,
      [itemId]: {
        preset_id: preset.id,
        preset_name: preset.role,
        original_value: item.rateExpected,
        override_value: preset.hourlyRate,
        type: "labor_rate" as const,
      },
    };
    setOverrides(newOverrides);
    // Clear any rate slider adjustment for this item
    setRateAdjustments(prev => { const n = { ...prev }; delete n[itemId]; return n; });
  };

  const removeOverride = (itemId: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[itemId];
    setOverrides(newOverrides);
  };

  const resetAll = () => {
    setOverrides({});
    setHourAdjustments({});
    setRateAdjustments({});
    setLocalDismissed(new Set());
  };

  return (
    <div>
      {/* Match Banner */}
      {unresolvedMatchCount > 0 && (
        <div className="px-5 py-3 bg-accent/5 border-b border-accent/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm text-foreground">
              <span className="font-semibold">{unresolvedMatchCount}</span> item{unresolvedMatchCount !== 1 ? "s" : ""} match your saved rates
            </span>
          </div>
          {onReviewAll && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onReviewAll}>Review All</Button>
          )}
        </div>
      )}

      <div className="p-5 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Labor</h3>
          {canEdit && onAddItem && (
            <button
              className="relative flex items-center justify-center w-5 h-5 rounded-full border border-accent/40 text-accent hover:bg-accent hover:text-white transition-all duration-200 before:absolute before:inset-[-6px] before:content-['']"
              onClick={() => {
                const el = document.getElementById("lab-add-row");
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                setTimeout(() => el?.querySelector("button")?.click(), 400);
              }}
              title="Add labor"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
          <span className="text-xs text-muted-foreground">{items.length} items · {Math.round(totalHours)} hrs · Subtotal: <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search labor..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-8 text-sm w-48" />
          </div>
          {hasAdjustments && (
            <Button variant="outline" size="sm" onClick={resetAll} className="h-8 text-xs"><RotateCcw className="w-3 h-3 mr-1" />Reset All</Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {[
                { key: "id", label: "ID", sortable: true },
                { key: "description", label: "Task", sortable: true },
                { key: "crew", label: "Crew", sortable: false },
                { key: "hours", label: "Hours", sortable: true },
                { key: "rate", label: "Rate/hr", sortable: true },
                { key: "total", label: "My Cost", sortable: true },
                { key: "markup", label: "Markup %", sortable: false },
                { key: "clientCost", label: "Client Cost", sortable: false },
              ].map(col => (
                <th key={col.key} className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground ${col.sortable ? "cursor-pointer hover:text-foreground" : ""} transition-colors`} onClick={col.sortable ? () => handleSort(col.key) : undefined}>
                  <span className="flex items-center gap-1">{col.label}{col.sortable && <ArrowUpDown className="w-3 h-3" />}</span>
                </th>
              ))}
              {canEdit && (
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-16"></th>
              )}
            </tr>
          </thead>
          <tbody>
            {itemsWithMarkup.map(item => {
              const match = matchByItemId.get(item.id);
              const override = overrides[item.id];
              const matchedPreset = match ? presetById.get(match.preset_id) : undefined;

              return (
                <RowFragment key={item.id}>
                  <tr
                    id={`row-${item.id}`}
                    className={`border-b border-border cursor-pointer hover:bg-muted/30 transition-colors ${expandedRow === item.id ? "bg-muted/50" : ""}`}
                    onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.id}</td>
                    <td className="px-4 py-3 font-medium text-foreground transition-colors duration-200 hover:text-accent">
                      {editingNameId === item.id ? (
                        <div className="flex items-start gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={editNameValue}
                            onChange={(e) => {
                              setEditNameValue(e.target.value);
                              e.target.style.height = "auto";
                              e.target.style.height = e.target.scrollHeight + "px";
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey && editNameValue.trim() && !savingName && !polishingName) {
                                e.preventDefault();
                                setSavingName(true);
                                onUpdateItem?.(item.id, { description: editNameValue.trim() })
                                  .then(() => setEditingNameId(null))
                                  .catch(() => toast.error("Failed to update name"))
                                  .finally(() => setSavingName(false));
                              }
                              if (e.key === "Escape") setEditingNameId(null);
                            }}
                            ref={(el) => {
                              if (el) {
                                el.focus();
                                el.style.height = "auto";
                                el.style.height = el.scrollHeight + "px";
                              }
                            }}
                            className="text-sm flex-1 min-w-0 resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-1.5 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            maxLength={500}
                            disabled={savingName || polishingName}
                            rows={1}
                          />
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0 text-accent hover:text-accent/80"
                            disabled={!editNameValue.trim() || polishingName || savingName}
                            onClick={() => {
                              setPolishingName(true);
                              polishText(editNameValue)
                                .then((polished) => setEditNameValue(polished))
                                .catch(() => toast.error("Polish failed"))
                                .finally(() => setPolishingName(false));
                            }}
                          >
                            {polishingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0 text-success hover:text-success/80"
                            disabled={!editNameValue.trim() || savingName || polishingName}
                            onClick={() => {
                              setSavingName(true);
                              onUpdateItem?.(item.id, { description: editNameValue.trim() })
                                .then(() => setEditingNameId(null))
                                .catch(() => toast.error("Failed to update name"))
                                .finally(() => setSavingName(false));
                            }}
                          >
                            {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => setEditingNameId(null)}
                            disabled={savingName}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {item.description}
                          {onUpdateItem && (
                            <button
                              className="p-1.5 -m-1.5 text-muted-foreground hover:text-accent transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingNameId(item.id);
                                setEditNameValue(item.description);
                              }}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                          {item.confidence === "low" && (
                            <Tooltip>
                              <TooltipTrigger><AlertTriangle className="w-3.5 h-3.5 text-confidence-low" /></TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">{item.confidenceNotes}</TooltipContent>
                            </Tooltip>
                          )}
                          {match && !override && (
                            <Badge className="text-[10px] bg-accent/10 text-accent border-accent/20 gap-1">
                              <Tag className="w-2.5 h-2.5" />Your rate available
                            </Badge>
                          )}
                          {override && (
                            <Badge className="text-[10px] bg-accent/10 text-accent border-accent/20 gap-1">
                              <Tag className="w-2.5 h-2.5" />{override.preset_name}
                            </Badge>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{item.crew}</td>
                    <td className="px-4 py-3">{item.hours}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {override ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-accent">{formatCurrencyDetailed(override.override_value)}/hr</span>
                          <button
                            onClick={() => removeOverride(item.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <span className="text-[10px] text-muted-foreground">(was {formatCurrencyDetailed(override.original_value)}/hr)</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span>{formatCurrencyDetailed(item.hourlyRate)}/hr</span>
                          {laborPresets.length > 0 && (
                            <Select value="" onValueChange={(presetId) => {
                              const preset = presetById.get(presetId);
                              if (preset) applyPreset(item.id, preset);
                            }}>
                              <SelectTrigger className="h-6 w-6 p-0 border-none bg-transparent [&>svg]:hidden">
                                <Tag className="w-3 h-3 text-muted-foreground hover:text-accent" />
                              </SelectTrigger>
                              <SelectContent>
                                {laborPresets.map(p => (
                                  <SelectItem key={p.id} value={p.id} className="text-xs">
                                    {p.role} — {formatCurrencyDetailed(p.hourlyRate)}/hr
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">{formatCurrency(item.total)}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <Input
                        type="number"
                        min={0}
                        max={999}
                        step={0.5}
                        value={item.markupPercent}
                        onChange={e => {
                          const v = parseFloat(e.target.value) || 0;
                          onMarkupChange?.(item.id, { markupPercent: v });
                        }}
                        className="h-7 w-16 text-xs font-mono text-center"
                        disabled={!onMarkupChange}
                      />
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={Math.round(item.clientCost * 100) / 100}
                        onChange={e => {
                          const clientVal = parseFloat(e.target.value) || 0;
                          if (item.total > 0) {
                            const backCalcPct = ((clientVal / item.total) - 1) * 100;
                            onMarkupChange?.(item.id, { markupPercent: Math.round(backCalcPct * 100) / 100 });
                          }
                        }}
                        className="h-7 w-24 text-xs font-mono text-right font-semibold text-accent"
                        disabled={!onMarkupChange}
                      />
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete labor item?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove &quot;{item.description}&quot; from the estimate.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDeleteItem?.(item.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    )}
                  </tr>
                  {expandedRow === item.id && (
                    <tr className="bg-muted/20">
                      <td colSpan={canEdit ? 9 : 8} className="px-4 py-5">
                        <div className="space-y-4">
                          {/* Suggestion Card (if LLM match exists and not yet applied) */}
                          {match && matchedPreset && !override && (
                            <div className="p-3 rounded-lg border border-accent/30 bg-accent/5">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                                  <span className="text-xs font-semibold text-foreground">Suggested Match: {matchedPreset.role}</span>
                                  <Badge className={`text-[10px] ${match.confidence === "high" ? "bg-confidence-high/10 text-confidence-high" : match.confidence === "medium" ? "bg-confidence-medium/10 text-confidence-medium" : "bg-confidence-low/10 text-confidence-low"}`}>
                                    {match.confidence}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-xs mb-2">
                                <span className="text-muted-foreground">Your rate: <span className="font-semibold text-accent">{formatCurrencyDetailed(matchedPreset.hourlyRate)}/hr</span></span>
                                <span className="text-muted-foreground">Estimate: <span className="font-semibold text-foreground">{formatCurrencyDetailed(item.rateExpected)}/hr</span></span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mb-2">{match.reasoning}</p>
                              <div className="flex items-center gap-2">
                                <Button size="sm" className="h-6 text-[10px]" onClick={(e) => { e.stopPropagation(); applyPreset(item.id, matchedPreset); }}>
                                  Apply
                                </Button>
                                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={(e) => { e.stopPropagation(); setLocalDismissed(prev => new Set(prev).add(item.id)); }}>
                                  Dismiss
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Preset Dropdown (always available if presets exist) */}
                          {laborPresets.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1"><Tag className="w-3 h-3" />Apply Saved Rate</h4>
                              <Select
                                value=""
                                onValueChange={(presetId) => {
                                  const preset = presetById.get(presetId);
                                  if (preset) applyPreset(item.id, preset);
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs w-64">
                                  <SelectValue placeholder="Select a preset..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {laborPresets.map(p => (
                                    <SelectItem key={p.id} value={p.id} className="text-xs">
                                      {p.role} — {formatCurrencyDetailed(p.hourlyRate)}/hr
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            {/* Hours Slider */}
                            <div>
                              <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1"><Clock className="w-3 h-3" />Hours Adjustment</h4>
                              <div className="space-y-2">
                                <Slider
                                  min={0}
                                  max={Math.max(item.hoursHigh * 2, 4)}
                                  step={0.5}
                                  value={[hourAdjustments[item.id] ?? item.hoursExpected]}
                                  onValueChange={([v]) => setHourAdjustments(prev => ({ ...prev, [item.id]: v }))}
                                  className="[&>span>span]:bg-accent"
                                />
                                <div className="flex items-center gap-2 mt-1">
                                  <Input
                                    type="number"
                                    value={hourAdjustments[item.id] ?? item.hoursExpected}
                                    onChange={(e) => {
                                      const v = Number(e.target.value);
                                      if (v >= 0) {
                                        setHourAdjustments(prev => ({ ...prev, [item.id]: v }));
                                      }
                                    }}
                                    min={0}
                                    step={0.5}
                                    className="h-7 w-20 text-xs font-mono"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <span className="text-[10px] text-muted-foreground">hrs</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                                  <span>{item.hoursLow} hrs</span>
                                  <span>{item.hoursHigh} hrs</span>
                                </div>
                                {hourAdjustments[item.id] && (
                                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={(e) => { e.stopPropagation(); setHourAdjustments(prev => { const n = { ...prev }; delete n[item.id]; return n; }); }}>
                                    <RotateCcw className="w-2.5 h-2.5 mr-1" />Reset
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Rate Slider (hidden when override is active) */}
                            {!override && (
                              <div>
                                <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1"><DollarSign className="w-3 h-3" />Rate Adjustment</h4>
                                <div className="space-y-2">
                                  <Slider
                                    min={0}
                                    max={Math.max(item.rateHigh * 2, 10) * 100}
                                    step={1}
                                    value={[(rateAdjustments[item.id] ?? item.rateExpected) * 100]}
                                    onValueChange={([v]) => setRateAdjustments(prev => ({ ...prev, [item.id]: v / 100 }))}
                                    className="[&>span>span]:bg-accent"
                                  />
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] text-muted-foreground">$</span>
                                    <Input
                                      type="number"
                                      value={rateAdjustments[item.id] ?? item.rateExpected}
                                      onChange={(e) => {
                                        const v = Number(e.target.value);
                                        if (v >= 0) {
                                          setRateAdjustments(prev => ({ ...prev, [item.id]: v }));
                                        }
                                      }}
                                      min={0}
                                      step={0.01}
                                      className="h-7 w-24 text-xs font-mono"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <span className="text-[10px] text-muted-foreground">/hr</span>
                                  </div>
                                  <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                                    <span>{formatCurrencyDetailed(item.rateLow)}/hr</span>
                                    <span>{formatCurrencyDetailed(item.rateHigh)}/hr</span>
                                  </div>
                                  {rateAdjustments[item.id] && (
                                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={(e) => { e.stopPropagation(); setRateAdjustments(prev => { const n = { ...prev }; delete n[item.id]; return n; }); }}>
                                      <RotateCcw className="w-2.5 h-2.5 mr-1" />Reset
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Labor Detail */}
                            <div>
                              <h4 className="text-xs font-semibold text-foreground mb-2">Task Detail</h4>
                              <p className="text-xs text-muted-foreground">Hours: {item.detail.hoursBreakdown}</p>
                              <p className="text-xs text-muted-foreground">Rate: {item.detail.productivityRate}</p>
                              <p className="text-xs text-muted-foreground mt-1">{item.detail.reasoning}</p>
                              {item.detail.siteAdjustments.length > 0 && (
                                <div className="mt-2">
                                  {item.detail.siteAdjustments.map((adj, i) => (
                                    <Badge key={i} variant="secondary" className="text-[10px] mr-1 mb-1">{adj}</Badge>
                                  ))}
                                </div>
                              )}
                              <p className="text-[10px] text-muted-foreground mt-2">Source: {item.source.document}, p.{item.source.page}</p>
                            </div>
                          </div>

                          {/* Collapse button */}
                          <div className="flex justify-center pt-3 border-t border-border mt-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={(e) => { e.stopPropagation(); setExpandedRow(null); }}
                            >
                              <ChevronsUp className="w-3.5 h-3.5" />
                              Collapse
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </RowFragment>
              );
            })}
          </tbody>
          {canEdit && onAddItem && (
            <tfoot id="lab-add-row">
              <AddLaborRow onAdd={onAddItem} laborPresets={laborPresets} presetById={presetById} colSpan={canEdit ? 9 : 8} />
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** Fragment wrapper to avoid React key warnings on adjacent <tr> elements */
function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function AddLaborRow({
  onAdd,
  laborPresets,
  presetById,
  colSpan,
}: {
  onAdd: (item: { description: string; quantity: number; unit: string; hours: number; hourly_rate: number; preset_id?: string; preset_name?: string }) => void;
  laborPresets: LaborPreset[];
  presetById: Map<string, LaborPreset>;
  colSpan: number;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState("each");
  const [hours, setHours] = useState<number>(0);
  const [hourlyRate, setHourlyRate] = useState<number>(0);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");

  const reset = () => {
    setDescription("");
    setQuantity(1);
    setUnit("each");
    setHours(0);
    setHourlyRate(0);
    setSelectedPresetId("");
    setOpen(false);
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = presetById.get(presetId);
    if (preset) {
      setHourlyRate(preset.hourlyRate);
      setSelectedPresetId(presetId);
    }
  };

  const handleSubmit = () => {
    if (!description.trim()) return;
    const preset = selectedPresetId ? presetById.get(selectedPresetId) : undefined;
    onAdd({
      description: description.trim(),
      quantity,
      unit,
      hours,
      hourly_rate: hourlyRate,
      preset_id: preset?.id,
      preset_name: preset?.role,
    });
    reset();
  };

  if (!open) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-4 py-3">
          <Button variant="outline" size="default" className="h-10 text-sm font-medium border-accent text-accent hover:bg-accent hover:text-white transition-all duration-200 hover:scale-105" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />Add Labor
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-accent/5 border-t border-accent/20">
      <td colSpan={colSpan} className="px-4 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="text-xs font-medium text-foreground mb-1 block">Description *</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Install 20A breakers" className="h-8 text-sm" />
          </div>
          <div className="w-20">
            <label className="text-xs font-medium text-foreground mb-1 block">Qty</label>
            <Input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} min={0} step={1} className="h-8 text-sm" />
          </div>
          <div className="w-20">
            <label className="text-xs font-medium text-foreground mb-1 block">Unit</label>
            <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="each" className="h-8 text-sm" />
          </div>
          <div className="w-24">
            <label className="text-xs font-medium text-foreground mb-1 block">Hours</label>
            <Input type="number" value={hours} onChange={e => setHours(Number(e.target.value))} min={0} step={0.5} className="h-8 text-sm" />
          </div>
          <div className="w-28">
            <label className="text-xs font-medium text-foreground mb-1 block">Rate ($/hr)</label>
            <Input type="number" value={hourlyRate} onChange={e => setHourlyRate(Number(e.target.value))} min={0} step={0.5} className="h-8 text-sm" />
          </div>
          {laborPresets.length > 0 && (
            <div className="w-48">
              <label className="text-xs font-medium text-foreground mb-1 block">Or use preset</label>
              <Select value={selectedPresetId} onValueChange={handlePresetSelect}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select preset..." />
                </SelectTrigger>
                <SelectContent>
                  {laborPresets.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.role} — {formatCurrencyDetailed(p.hourlyRate)}/hr
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-xs" onClick={handleSubmit} disabled={!description.trim()}>Add</Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={reset}>Cancel</Button>
          </div>
        </div>
      </td>
    </tr>
  );
}
