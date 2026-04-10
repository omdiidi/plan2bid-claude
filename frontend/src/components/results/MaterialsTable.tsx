import { useState, useMemo, useEffect, useRef } from "react";
import { MaterialItem } from "@/lib/constants";
import { formatCurrency, formatCurrencyDetailed } from "@/lib/utils";
import { polishText } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, AlertTriangle, ExternalLink, RotateCcw, ArrowUpDown, DollarSign, Tag, X, Sparkles, Trash2, Plus, ChevronsUp, Pencil, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PresetMatch, ItemOverride, ItemMarkup } from "@/types";
import type { MaterialPreset } from "@/lib/app-context";

interface Props {
  items: MaterialItem[];
  scrollToId?: string | null;
  materialPresets?: MaterialPreset[];
  presetMatches?: PresetMatch[];
  initialOverrides?: Record<string, ItemOverride>;
  onOverridesChange?: (overrides: Record<string, ItemOverride>) => void;
  onSubtotalChange?: (subtotal: number) => void;
  onReviewAll?: () => void;
  dismissedMatches?: Set<string>;
  canEdit?: boolean;
  onDeleteItem?: (itemId: string) => void;
  onAddItem?: (item: { description: string; quantity: number; unit: string; unit_cost: number; preset_id?: string; preset_name?: string }) => void;
  markupOverrides?: Record<string, ItemMarkup>;
  defaultMarkupPercent?: number;
  onMarkupChange?: (itemId: string, markup: ItemMarkup) => void;
  onClientSubtotalChange?: (clientSubtotal: number) => void;
  wasteItems?: Record<string, boolean>;
  onWasteChange?: (itemId: string, enabled: boolean) => void;
  wasteDefaultPercent?: number;
  wasteCustomPercent?: Record<string, number>;
  onWasteDefaultChange?: (pct: number) => void;
  onWasteCustomChange?: (itemId: string, pct: number | undefined) => void;
  onUpdateItem?: (itemId: string, updates: { material_description?: string; description?: string }) => Promise<void>;
  onItemDataChange?: (items: Array<{ id: string; unitCost: number; qty: number; total: number }>) => void;
}

export default function MaterialsTable({
  items: rawItems,
  scrollToId,
  materialPresets = [],
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
  wasteItems,
  onWasteChange,
  wasteDefaultPercent = 10,
  wasteCustomPercent,
  onWasteDefaultChange,
  onWasteCustomChange,
  onUpdateItem,
  onItemDataChange,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedRow, setExpandedRow] = useState<string | null>(scrollToId ?? null);
  const [overrides, setOverrides] = useState<Record<string, ItemOverride>>(initialOverrides ?? {});
  const [sliderAdjustments, setSliderAdjustments] = useState<Record<string, number>>({});
  const [qtyAdjustments, setQtyAdjustments] = useState<Record<string, number>>({});
  const syncingFromParent = useRef(false);
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());

  // Inline edit state
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [editDescValue, setEditDescValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);
  const [polishingName, setPolishingName] = useState(false);
  const [polishingDesc, setPolishingDesc] = useState(false);

  // Waste edit state
  const [editingWasteDefault, setEditingWasteDefault] = useState(false);
  const [wasteDefaultDraft, setWasteDefaultDraft] = useState(String(wasteDefaultPercent));
  const [editingWasteItemId, setEditingWasteItemId] = useState<string | null>(null);
  const [wasteItemDraft, setWasteItemDraft] = useState("");

  // Sync waste default draft when prop changes (e.g. from persisted overrides loading)
  useEffect(() => {
    if (!editingWasteDefault) setWasteDefaultDraft(String(wasteDefaultPercent));
  }, [wasteDefaultPercent, editingWasteDefault]);

  const dismissedMatches = externalDismissed
    ? new Set([...externalDismissed, ...localDismissed])
    : localDismissed;

  // Sync overrides from parent when initialOverrides changes
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
    const map = new Map<string, MaterialPreset>();
    for (const p of materialPresets) map.set(p.id, p);
    return map;
  }, [materialPresets]);

  // Compute adjusted values for ALL items (pre-filter/sort) — used by onItemDataChange
  const allComputedItems = useMemo(() => {
    return rawItems.map(item => {
      const override = overrides[item.id];
      const sliderAdj = sliderAdjustments[item.id];
      const unitCost = override ? override.override_value : (sliderAdj ?? item.costExpected);
      const qty = qtyAdjustments[item.id] ?? item.qty;
      const total = unitCost * qty;
      return { ...item, unitCost, qty, total };
    });
  }, [rawItems, overrides, sliderAdjustments, qtyAdjustments]);

  const items = useMemo(() => {
    return allComputedItems
      .filter(item => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return item.materialName.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        switch (sortField) {
          case "description": return a.materialName.localeCompare(b.materialName) * dir;
          case "total": return (a.total - b.total) * dir;
          case "confidence": {
            const order = { high: 0, medium: 1, low: 2 };
            return (order[a.confidence] - order[b.confidence]) * dir;
          }
          default: return a.id.localeCompare(b.id) * dir;
        }
      });
  }, [allComputedItems, searchQuery, sortField, sortDir]);

  const hasAdjustments = Object.keys(overrides).length > 0 || Object.keys(sliderAdjustments).length > 0 || Object.keys(qtyAdjustments).length > 0;

  // Compute per-item waste, markup, and client costs
  const itemsWithMarkup = useMemo(() => {
    return items.map(item => {
      const hasWaste = !!wasteItems?.[item.id];
      const effectivePct = hasWaste
        ? (wasteCustomPercent?.[item.id] ?? wasteDefaultPercent)
        : 0;
      const wasteMult = 1 + effectivePct / 100;
      const wasteQty = item.qty * wasteMult;
      const wasteTotal = item.total * wasteMult;
      const mkPct = markupOverrides?.[item.id]?.markupPercent ?? defaultMarkupPercent;
      const markupAmt = wasteTotal * (mkPct / 100);
      const clientCost = wasteTotal + markupAmt;
      return { ...item, qty: wasteQty, total: wasteTotal, hasWaste, wastePct: effectivePct, markupPercent: mkPct, markupAmt, clientCost };
    });
  }, [items, wasteItems, wasteDefaultPercent, wasteCustomPercent, markupOverrides, defaultMarkupPercent]);

  const subtotal = itemsWithMarkup.reduce((s, i) => s + i.total, 0);
  const clientSubtotal = itemsWithMarkup.reduce((s, i) => s + i.clientCost, 0);

  // Propagate subtotal changes
  useEffect(() => {
    onSubtotalChange?.(subtotal);
  }, [subtotal, onSubtotalChange]);

  // Propagate client subtotal changes
  useEffect(() => {
    onClientSubtotalChange?.(clientSubtotal);
  }, [clientSubtotal, onClientSubtotalChange]);

  // Propagate computed item data (pre-waste, all items including search-hidden)
  useEffect(() => {
    onItemDataChange?.(allComputedItems.map(i => ({ id: i.id, unitCost: i.unitCost, qty: i.qty, total: i.total })));
  }, [allComputedItems, onItemDataChange]);

  // Propagate override changes (skip when syncing from parent to avoid loop)
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

  const applyPreset = (itemId: string, preset: MaterialPreset) => {
    const item = rawItems.find(i => i.id === itemId);
    if (!item) return;
    const newOverrides = {
      ...overrides,
      [itemId]: {
        preset_id: preset.id,
        preset_name: preset.name,
        original_value: item.costExpected,
        override_value: preset.unitPrice,
        type: "material_price" as const,
      },
    };
    setOverrides(newOverrides);
    // Clear any slider adjustment for this item
    setSliderAdjustments(prev => { const n = { ...prev }; delete n[itemId]; return n; });
  };

  const removeOverride = (itemId: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[itemId];
    setOverrides(newOverrides);
  };

  const resetAll = () => {
    setOverrides({});
    setSliderAdjustments({});
    setQtyAdjustments({});
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
              <span className="font-semibold">{unresolvedMatchCount}</span> item{unresolvedMatchCount !== 1 ? "s" : ""} match your saved prices
            </span>
          </div>
          {onReviewAll && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onReviewAll}>Review All</Button>
          )}
        </div>
      )}

      <div className="p-5 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Materials</h3>
          {canEdit && onAddItem && (
            <button
              className="relative flex items-center justify-center w-5 h-5 rounded-full border border-accent/40 text-accent hover:bg-accent hover:text-white transition-all duration-200 before:absolute before:inset-[-6px] before:content-['']"
              onClick={() => {
                const el = document.getElementById("mat-add-row");
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                setTimeout(() => el?.querySelector("button")?.click(), 400);
              }}
              title="Add material"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
          <span className="text-xs text-muted-foreground">{items.length} items · Subtotal: <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search materials..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-8 text-sm w-48" />
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
                { key: "description", label: "Material", sortable: true },
                { key: "qty", label: "Qty", sortable: true },
              ].map(col => (
                <th key={col.key} className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors`} onClick={() => handleSort(col.key)}>
                  <span className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></span>
                </th>
              ))}
              {onWasteChange && (
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground min-w-[120px]">
                  {editingWasteDefault ? (
                    <span className="flex items-center justify-center gap-1">
                      <span>Waste</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={wasteDefaultDraft}
                        onChange={e => setWasteDefaultDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            const v = parseFloat(wasteDefaultDraft);
                            onWasteDefaultChange?.(isNaN(v) ? 10 : Math.max(0, Math.min(100, v)));
                            setEditingWasteDefault(false);
                          } else if (e.key === "Escape") {
                            setWasteDefaultDraft(String(wasteDefaultPercent));
                            setEditingWasteDefault(false);
                          }
                        }}
                        className="h-6 w-14 text-xs px-1"
                        autoFocus
                      />
                      <span className="text-xs">%</span>
                      <button onClick={() => {
                        const v = parseFloat(wasteDefaultDraft);
                        onWasteDefaultChange?.(isNaN(v) ? 10 : Math.max(0, Math.min(100, v)));
                        setEditingWasteDefault(false);
                      }} className="text-success hover:text-success/80"><Check className="w-3 h-3" /></button>
                      <button onClick={() => {
                        setWasteDefaultDraft(String(wasteDefaultPercent));
                        setEditingWasteDefault(false);
                      }} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-0.5">
                      <span>Waste ({wasteDefaultPercent}%)</span>
                      {onWasteDefaultChange && (
                        <button onClick={() => { setWasteDefaultDraft(String(wasteDefaultPercent)); setEditingWasteDefault(true); }} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
                      )}
                    </span>
                  )}
                </th>
              )}
              {[
                { key: "unit", label: "Unit", sortable: false },
                { key: "unitCost", label: "Unit Cost", sortable: true },
                { key: "total", label: "My Cost", sortable: true },
              ].map(col => (
                <th key={col.key} className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground ${col.sortable ? "cursor-pointer hover:text-foreground" : ""} transition-colors`} onClick={col.sortable ? () => handleSort(col.key) : undefined}>
                  <span className="flex items-center gap-1">{col.label}{col.sortable && <ArrowUpDown className="w-3 h-3" />}</span>
                </th>
              ))}
              {[
                { key: "markup", label: "Markup %", sortable: false },
                { key: "clientCost", label: "Client Cost", sortable: false },
              ].map(col => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground transition-colors">
                  <span className="flex items-center gap-1">{col.label}</span>
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
                      <div>
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
                                  onUpdateItem?.(item.id, { material_description: editNameValue.trim() })
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
                                onUpdateItem?.(item.id, { material_description: editNameValue.trim() })
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
                            {item.materialName}
                            {onUpdateItem && (
                              <button
                                className="p-1.5 -m-1.5 text-muted-foreground hover:text-accent transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingNameId(item.id);
                                  setEditNameValue(item.materialName);
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
                                <Tag className="w-2.5 h-2.5" />Your price available
                              </Badge>
                            )}
                            {override && (
                              <Badge className="text-[10px] bg-accent/10 text-accent border-accent/20 gap-1">
                                <Tag className="w-2.5 h-2.5" />{override.preset_name}
                              </Badge>
                            )}
                          </div>
                        )}
                        {(item.manufacturer || item.modelNumber) && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {[item.manufacturer, item.modelNumber].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Input
                        type="number"
                        value={qtyAdjustments[item.id] ?? item.qty}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (v >= 0) setQtyAdjustments(prev => ({ ...prev, [item.id]: v }));
                        }}
                        min={0}
                        step={1}
                        className="h-7 w-20 text-sm font-mono"
                      />
                    </td>
                    {onWasteChange && (
                      <td className="px-4 py-3 min-w-[120px]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <label className="flex items-center justify-center p-2 -m-2 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={item.hasWaste ?? false}
                              onChange={() => onWasteChange(item.id, !item.hasWaste)}
                              className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                            />
                          </label>
                          {item.hasWaste && (
                            editingWasteItemId === item.id ? (
                              <span className="flex items-center gap-0.5">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={wasteItemDraft}
                                  onChange={e => setWasteItemDraft(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      const v = parseFloat(wasteItemDraft);
                                      if (!isNaN(v)) onWasteCustomChange?.(item.id, Math.max(0, Math.min(100, v)));
                                      setEditingWasteItemId(null);
                                    } else if (e.key === "Escape") {
                                      setEditingWasteItemId(null);
                                    }
                                  }}
                                  className="h-6 w-12 text-xs px-1"
                                  autoFocus
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                                <button onClick={() => {
                                  const v = parseFloat(wasteItemDraft);
                                  if (!isNaN(v)) onWasteCustomChange?.(item.id, Math.max(0, Math.min(100, v)));
                                  setEditingWasteItemId(null);
                                }} className="text-success hover:text-success/80"><Check className="w-3 h-3" /></button>
                                <button onClick={() => setEditingWasteItemId(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5">
                                <span className={`text-xs ${wasteCustomPercent?.[item.id] != null ? "font-medium" : "text-muted-foreground"}`}>
                                  {item.wastePct}%
                                </span>
                                {onWasteCustomChange && (
                                  <button onClick={() => { setWasteItemDraft(String(item.wastePct)); setEditingWasteItemId(item.id); }} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
                                )}
                                {wasteCustomPercent?.[item.id] != null && onWasteCustomChange && (
                                  <button onClick={() => onWasteCustomChange(item.id, undefined)} className="text-muted-foreground hover:text-foreground" title="Reset to default"><X className="w-3 h-3" /></button>
                                )}
                              </span>
                            )
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {override ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-accent">{formatCurrencyDetailed(override.override_value)}</span>
                          <button
                            onClick={() => removeOverride(item.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <span className="text-[10px] text-muted-foreground">(was {formatCurrencyDetailed(override.original_value)})</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span>{formatCurrencyDetailed(item.unitCost)}</span>
                          {materialPresets.length > 0 && (
                            <Select value="" onValueChange={(presetId) => {
                              const preset = presetById.get(presetId);
                              if (preset) applyPreset(item.id, preset);
                            }}>
                              <SelectTrigger className="h-6 w-6 p-0 border-none bg-transparent [&>svg]:hidden">
                                <Tag className="w-3 h-3 text-muted-foreground hover:text-accent" />
                              </SelectTrigger>
                              <SelectContent>
                                {materialPresets.map(p => (
                                  <SelectItem key={p.id} value={p.id} className="text-xs">
                                    {p.name} — {formatCurrencyDetailed(p.unitPrice)}/{p.unit}
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
                              <AlertDialogTitle>Delete material item?</AlertDialogTitle>
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
                                  <span className="text-xs font-semibold text-foreground">Suggested Match: {matchedPreset.name}</span>
                                  <Badge className={`text-[10px] ${match.confidence === "high" ? "bg-confidence-high/10 text-confidence-high" : match.confidence === "medium" ? "bg-confidence-medium/10 text-confidence-medium" : "bg-confidence-low/10 text-confidence-low"}`}>
                                    {match.confidence}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-xs mb-2">
                                <span className="text-muted-foreground">Your price: <span className="font-semibold text-accent">{formatCurrencyDetailed(matchedPreset.unitPrice)}/{matchedPreset.unit}</span></span>
                                <span className="text-muted-foreground">Estimate: <span className="font-semibold text-foreground">{formatCurrencyDetailed(item.costExpected)}/{item.unit}</span></span>
                                {matchedPreset.unit !== item.unit && (
                                  <Badge variant="destructive" className="text-[10px]">Unit mismatch</Badge>
                                )}
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
                          {materialPresets.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1"><Tag className="w-3 h-3" />Apply Saved Price</h4>
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
                                  {materialPresets.map(p => (
                                    <SelectItem key={p.id} value={p.id} className="text-xs">
                                      {p.name} — {formatCurrencyDetailed(p.unitPrice)}/{p.unit}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {/* Price Slider */}
                            {!override && (
                              <div>
                                <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1"><DollarSign className="w-3 h-3" />Price Adjustment</h4>
                                <div className="space-y-2">
                                  <Slider
                                    min={0}
                                    max={Math.max(item.costHigh * 2, 10) * 100}
                                    step={1}
                                    value={[(sliderAdjustments[item.id] ?? item.costExpected) * 100]}
                                    onValueChange={([v]) => setSliderAdjustments(prev => ({ ...prev, [item.id]: v / 100 }))}
                                    className="[&>span>span]:bg-accent"
                                  />
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] text-muted-foreground">$</span>
                                    <Input
                                      type="number"
                                      value={sliderAdjustments[item.id] ?? item.costExpected}
                                      onChange={(e) => {
                                        const v = Number(e.target.value);
                                        if (v >= 0) {
                                          setSliderAdjustments(prev => ({ ...prev, [item.id]: v }));
                                        }
                                      }}
                                      min={0}
                                      step={0.01}
                                      className="h-7 w-24 text-xs font-mono"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                  <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                                    <span>{formatCurrencyDetailed(item.costLow)}</span>
                                    <span>{formatCurrencyDetailed(item.costHigh)}</span>
                                  </div>
                                  {sliderAdjustments[item.id] && (
                                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={(e) => { e.stopPropagation(); setSliderAdjustments(prev => { const n = { ...prev }; delete n[item.id]; return n; }); }}>
                                      <RotateCcw className="w-2.5 h-2.5 mr-1" />Reset
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Material Detail */}
                            <div>
                              {(item.taskDescription !== item.materialName || editingDescId === item.id || onUpdateItem) && (
                                <div className="mb-3">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <h4 className="text-xs font-semibold text-foreground">Task Description</h4>
                                    {onUpdateItem && editingDescId !== item.id && (
                                      <button
                                        className="text-muted-foreground hover:text-accent transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingDescId(item.id);
                                          setEditDescValue(item.taskDescription);
                                        }}
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  {editingDescId === item.id ? (
                                    <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                                      <textarea
                                        value={editDescValue}
                                        onChange={(e) => setEditDescValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Escape") setEditingDescId(null);
                                        }}
                                        className="w-full text-xs p-2 rounded-md border border-input bg-background resize-y min-h-[60px] max-h-[200px]"
                                        autoFocus
                                        maxLength={2000}
                                        disabled={savingDesc || polishingDesc}
                                      />
                                      <div className="flex items-center gap-1.5">
                                        <Button
                                          variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-accent hover:text-accent/80 gap-1"
                                          disabled={!editDescValue.trim() || polishingDesc || savingDesc}
                                          onClick={() => {
                                            setPolishingDesc(true);
                                            polishText(editDescValue)
                                              .then((polished) => setEditDescValue(polished))
                                              .catch(() => toast.error("Polish failed"))
                                              .finally(() => setPolishingDesc(false));
                                          }}
                                        >
                                          {polishingDesc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                          Polish
                                        </Button>
                                        <Button
                                          variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-success hover:text-success/80 gap-1"
                                          disabled={!editDescValue.trim() || savingDesc || polishingDesc}
                                          onClick={() => {
                                            setSavingDesc(true);
                                            onUpdateItem?.(item.id, { description: editDescValue.trim() })
                                              .then(() => setEditingDescId(null))
                                              .catch(() => toast.error("Failed to update description"))
                                              .finally(() => setSavingDesc(false));
                                          }}
                                        >
                                          {savingDesc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                          Save
                                        </Button>
                                        <Button
                                          variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                                          onClick={() => setEditingDescId(null)}
                                          disabled={savingDesc}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">{item.taskDescription}</p>
                                  )}
                                </div>
                              )}
                              {item.reasoning && (
                                <div className="mb-3">
                                  <h4 className="text-xs font-semibold text-foreground mb-1">Pricing Reasoning</h4>
                                  <p className="text-xs text-muted-foreground">{item.reasoning}</p>
                                </div>
                              )}
                              <h4 className="text-xs font-semibold text-foreground mb-2">Source Detail</h4>
                              <p className="text-xs text-muted-foreground mb-1">Method: {item.detail.pricingMethod}</p>
                              <div className="flex flex-wrap gap-1 mb-1">
                                {item.detail.sources.map(s => (
                                  <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline flex items-center gap-0.5">
                                    {s.name}<ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground">{item.detail.notes}</p>
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
            <tfoot id="mat-add-row">
              <AddMaterialRow onAdd={onAddItem} materialPresets={materialPresets} presetById={presetById} colSpan={canEdit ? 9 : 8} />
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

function AddMaterialRow({
  onAdd,
  materialPresets,
  presetById,
  colSpan,
}: {
  onAdd: (item: { description: string; quantity: number; unit: string; unit_cost: number; preset_id?: string; preset_name?: string }) => void;
  materialPresets: MaterialPreset[];
  presetById: Map<string, MaterialPreset>;
  colSpan: number;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState("each");
  const [unitCost, setUnitCost] = useState<number>(0);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");

  const reset = () => {
    setDescription("");
    setQuantity(1);
    setUnit("each");
    setUnitCost(0);
    setSelectedPresetId("");
    setOpen(false);
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = presetById.get(presetId);
    if (preset) {
      setUnitCost(preset.unitPrice);
      setUnit(preset.unit);
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
      unit_cost: unitCost,
      preset_id: preset?.id,
      preset_name: preset?.name,
    });
    reset();
  };

  if (!open) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-4 py-3">
          <Button variant="outline" size="default" className="h-10 text-sm font-medium border-accent text-accent hover:bg-accent hover:text-white transition-all duration-200 hover:scale-105" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />Add Material
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
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. 20A Single Pole Breaker" className="h-8 text-sm" />
          </div>
          <div className="w-20">
            <label className="text-xs font-medium text-foreground mb-1 block">Qty</label>
            <Input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} min={0} step={1} className="h-8 text-sm" />
          </div>
          <div className="w-20">
            <label className="text-xs font-medium text-foreground mb-1 block">Unit</label>
            <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="each" className="h-8 text-sm" />
          </div>
          <div className="w-28">
            <label className="text-xs font-medium text-foreground mb-1 block">Unit Cost ($)</label>
            <Input type="number" value={unitCost} onChange={e => setUnitCost(Number(e.target.value))} min={0} step={0.01} className="h-8 text-sm" />
          </div>
          {materialPresets.length > 0 && (
            <div className="w-48">
              <label className="text-xs font-medium text-foreground mb-1 block">Or use preset</label>
              <Select value={selectedPresetId} onValueChange={handlePresetSelect}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select preset..." />
                </SelectTrigger>
                <SelectContent>
                  {materialPresets.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name} — {formatCurrencyDetailed(p.unitPrice)}/{p.unit}
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
