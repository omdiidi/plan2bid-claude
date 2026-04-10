import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCurrencyDetailed } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import type { PresetMatch, ItemOverride } from "@/types";
import type { MaterialPreset, LaborPreset } from "@/lib/app-context";
import type { MaterialItem, LaborItem } from "@/lib/constants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materialMatches: PresetMatch[];
  laborMatches: PresetMatch[];
  materialPresets: MaterialPreset[];
  laborPresets: LaborPreset[];
  materialItems: MaterialItem[];
  laborItems: LaborItem[];
  materialOverrides: Record<string, ItemOverride>;
  laborOverrides: Record<string, ItemOverride>;
  dismissedMatches: Set<string>;
  onApplyMaterial: (itemId: string, preset: MaterialPreset) => void;
  onApplyLabor: (itemId: string, preset: LaborPreset) => void;
  onDismiss: (itemId: string) => void;
}

export default function ReviewMatchesDialog({
  open,
  onOpenChange,
  materialMatches,
  laborMatches,
  materialPresets,
  laborPresets,
  materialItems,
  laborItems,
  materialOverrides,
  laborOverrides,
  dismissedMatches,
  onApplyMaterial,
  onApplyLabor,
  onDismiss,
}: Props) {
  const matPresetMap = new Map(materialPresets.map(p => [p.id, p]));
  const labPresetMap = new Map(laborPresets.map(p => [p.id, p]));
  const matItemMap = new Map(materialItems.map(i => [i.id, i]));
  const labItemMap = new Map(laborItems.map(i => [i.id, i]));

  // Only show unresolved matches
  const pendingMaterialMatches = materialMatches.filter(
    m => !dismissedMatches.has(m.item_id) && !materialOverrides[m.item_id]
  );
  const pendingLaborMatches = laborMatches.filter(
    m => !dismissedMatches.has(m.item_id) && !laborOverrides[m.item_id]
  );

  const totalPending = pendingMaterialMatches.length + pendingLaborMatches.length;

  const applyAllCompatible = () => {
    // Apply high and medium confidence matches with matching units
    for (const m of pendingMaterialMatches) {
      if (m.confidence === "low") continue;
      const preset = matPresetMap.get(m.preset_id);
      const item = matItemMap.get(m.item_id);
      if (!preset || !item) continue;
      if (preset.unit !== item.unit) continue; // Skip unit mismatches
      onApplyMaterial(m.item_id, preset);
    }
    for (const m of pendingLaborMatches) {
      if (m.confidence === "low") continue;
      const preset = labPresetMap.get(m.preset_id);
      if (!preset) continue;
      onApplyLabor(m.item_id, preset);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            Review Matches ({totalPending})
          </SheetTitle>
          <SheetDescription>
            Suggested preset matches based on your saved prices and rates.
          </SheetDescription>
        </SheetHeader>

        {totalPending > 0 && (
          <div className="mt-4 mb-2">
            <Button size="sm" variant="outline" onClick={applyAllCompatible} className="text-xs">
              Apply All Compatible
            </Button>
            <p className="text-[10px] text-muted-foreground mt-1">Applies high & medium confidence matches with matching units.</p>
          </div>
        )}

        {totalPending === 0 && (
          <p className="text-sm text-muted-foreground mt-6">No pending matches to review.</p>
        )}

        {/* Material Matches */}
        {pendingMaterialMatches.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Material Matches</h4>
            <div className="space-y-2">
              {pendingMaterialMatches.map(m => {
                const preset = matPresetMap.get(m.preset_id);
                const item = matItemMap.get(m.item_id);
                if (!preset || !item) return null;
                return (
                  <MatchRow
                    key={m.item_id}
                    itemId={m.item_id}
                    itemDesc={item.description}
                    presetName={preset.name}
                    presetValue={`${formatCurrencyDetailed(preset.unitPrice)}/${preset.unit}`}
                    estimateValue={`${formatCurrencyDetailed(item.costExpected)}/${item.unit}`}
                    unitMismatch={preset.unit !== item.unit}
                    confidence={m.confidence}
                    reasoning={m.reasoning}
                    onApply={() => onApplyMaterial(m.item_id, preset)}
                    onDismiss={() => onDismiss(m.item_id)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Labor Matches */}
        {pendingLaborMatches.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Labor Matches</h4>
            <div className="space-y-2">
              {pendingLaborMatches.map(m => {
                const preset = labPresetMap.get(m.preset_id);
                const item = labItemMap.get(m.item_id);
                if (!preset || !item) return null;
                return (
                  <MatchRow
                    key={m.item_id}
                    itemId={m.item_id}
                    itemDesc={item.description}
                    presetName={preset.role}
                    presetValue={`${formatCurrencyDetailed(preset.hourlyRate)}/hr`}
                    estimateValue={`${formatCurrencyDetailed(item.rateExpected)}/hr`}
                    unitMismatch={false}
                    confidence={m.confidence}
                    reasoning={m.reasoning}
                    onApply={() => onApplyLabor(m.item_id, preset)}
                    onDismiss={() => onDismiss(m.item_id)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MatchRow({
  itemId,
  itemDesc,
  presetName,
  presetValue,
  estimateValue,
  unitMismatch,
  confidence,
  reasoning,
  onApply,
  onDismiss,
}: {
  itemId: string;
  itemDesc: string;
  presetName: string;
  presetValue: string;
  estimateValue: string;
  unitMismatch: boolean;
  confidence: string;
  reasoning: string;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="p-3 rounded-lg border border-border bg-muted/20">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-[10px] text-muted-foreground">{itemId}</span>
        <Badge className={`text-[10px] ${confidence === "high" ? "bg-confidence-high/10 text-confidence-high" : confidence === "medium" ? "bg-confidence-medium/10 text-confidence-medium" : "bg-confidence-low/10 text-confidence-low"}`}>
          {confidence}
        </Badge>
        {unitMismatch && <Badge variant="destructive" className="text-[10px]">Unit mismatch</Badge>}
      </div>
      <p className="text-xs font-medium text-foreground mb-1">{itemDesc}</p>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-1">
        <span>Your price: <span className="text-accent font-semibold">{presetValue}</span> ({presetName})</span>
        <span>Estimate: <span className="text-foreground font-semibold">{estimateValue}</span></span>
      </div>
      <p className="text-[10px] text-muted-foreground mb-2">{reasoning}</p>
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-5 text-[10px] px-2" onClick={onApply}>Apply</Button>
        <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2" onClick={onDismiss}>Dismiss</Button>
      </div>
    </div>
  );
}
