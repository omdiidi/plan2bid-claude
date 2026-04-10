import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { TRADES } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Zap, Droplets, Wind, HardHat, Hammer, LayoutGrid,
  Layers, Umbrella, Paintbrush, Grid3X3,
  Trees, Flame, Building2, Cable, PlayCircle, CheckCircle2,
  LayoutList, X, Bookmark, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ComboTooltip from "@/components/ComboTooltip";

const SELECTABLE_TRADES = TRADES.filter(t => t.value !== "general_contractor");

const TRADE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  electrical: Zap,
  plumbing: Droplets,
  hvac: Wind,
  concrete: HardHat,
  demolition: Hammer,
  framing: LayoutGrid,
  drywall: Layers,
  roofing: Umbrella,
  painting: Paintbrush,
  flooring: Grid3X3,
  landscaping: Trees,
  fire_protection: Flame,
  structural_steel: Building2,
  low_voltage: Cable,
};

export default function SelectTrades() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useApp();

  const [multiSelect, setMultiSelect] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [comboName, setComboName] = useState("");

  const savedCombos = settings.savedCombinations || [];

  // --- handlers ---

  const handleTradeClick = (value: string) => {
    if (!multiSelect) {
      navigate(`/new-estimate?trades=${value}`);
      return;
    }
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleRunAll = () => {
    if (multiSelect) {
      // Select all trades
      setSelected(new Set(SELECTABLE_TRADES.map(t => t.value)));
    } else {
      navigate("/new-estimate?trades=all");
    }
  };

  const handleRunSelected = () => {
    if (selected.size === 0) return;
    const trades = Array.from(selected).join(",");
    navigate(`/new-estimate?trades=${trades}`);
  };

  const handleToggleMultiSelect = () => {
    setMultiSelect(prev => !prev);
    setSelected(new Set());
  };

  const handleSaveCombination = () => {
    if (!comboName.trim() || selected.size === 0) return;
    const newCombo = {
      id: Date.now().toString(),
      name: comboName.trim(),
      trades: Array.from(selected),
    };
    updateSettings({
      savedCombinations: [...savedCombos, newCombo],
    });
    setSaveDialogOpen(false);
    setComboName("");
    toast.success("Combination saved");
  };

  const handleDeleteCombo = (id: string) => {
    updateSettings({
      savedCombinations: savedCombos.filter(c => c.id !== id),
    });
    toast.success("Combination removed");
  };

  const handleComboClick = (trades: string[]) => {
    navigate(`/new-estimate?trades=${trades.join(",")}`);
  };

  // Build label for the "Run N trades" button
  const selectedLabels = Array.from(selected)
    .map(v => SELECTABLE_TRADES.find(t => t.value === v)?.label || v)
    .slice(0, 3);
  const runLabel =
    selected.size === 0
      ? ""
      : selected.size <= 3
        ? `Run ${selectedLabels.join(", ")}`
        : `Run ${selected.size} trades`;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold text-foreground">Select Your Trade</h1>
        <p className="text-muted-foreground">Choose a trade to estimate, or run multiple at once</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant={multiSelect ? "default" : "outline"}
          onClick={handleToggleMultiSelect}
          className="gap-2"
        >
          {multiSelect ? <CheckCircle2 className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
          {multiSelect ? "Cancel Selection" : "Select Multiple"}
        </Button>

        {multiSelect && selected.size > 0 && (
          <div className="flex items-center gap-2 animate-fade-in">
            <Button
              variant="outline"
              onClick={() => setSaveDialogOpen(true)}
              className="gap-2"
            >
              <Bookmark className="w-4 h-4" />
              Save Combination
            </Button>
            <Button
              onClick={handleRunSelected}
              className="gradient-accent text-accent-foreground font-semibold shadow-accent hover:opacity-90 transition-opacity gap-2"
            >
              {runLabel}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Saved Combinations */}
      {savedCombos.length > 0 && (
        <div className="animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground mb-3">Saved Combinations</h3>
          <div className="flex flex-wrap gap-2">
            {savedCombos.map(combo => (
              <ComboTooltip key={combo.id} trades={combo.trades}>
                <div
                  className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 hover:bg-accent/20 transition-colors cursor-pointer"
                >
                  <button
                    onClick={() => handleComboClick(combo.trades)}
                    className="flex items-center gap-1.5 text-sm font-medium text-accent"
                  >
                    {combo.name}
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {combo.trades.length}
                    </Badge>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCombo(combo.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive ml-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </ComboTooltip>
            ))}
          </div>
        </div>
      )}

      {/* Trade Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Run All Tile */}
        <button
          onClick={handleRunAll}
          className="animate-scale-in group"
          style={{ animationDelay: "0ms" }}
        >
          <Card className="p-6 h-full gradient-accent text-accent-foreground shadow-accent hover:opacity-90 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer">
            <PlayCircle className="w-10 h-10" />
            <span className="text-sm font-bold">Run All Trades</span>
            <span className="text-xs opacity-80">{SELECTABLE_TRADES.length} trades in parallel</span>
          </Card>
        </button>

        {/* Individual Trade Tiles */}
        {SELECTABLE_TRADES.map((trade, index) => {
          const Icon = TRADE_ICONS[trade.value] || HardHat;
          const isSelected = selected.has(trade.value);
          return (
            <button
              key={trade.value}
              onClick={() => handleTradeClick(trade.value)}
              className="animate-scale-in group"
              style={{ animationDelay: `${(index + 1) * 50}ms` }}
            >
              <Card
                className={cn(
                  "p-6 h-full shadow-card hover:shadow-card-hover transition-all",
                  "flex flex-col items-center justify-center gap-3 cursor-pointer",
                  "hover:border-accent/50",
                  isSelected && "border-accent bg-accent/5 ring-2 ring-accent/30",
                )}
              >
                <div className="relative">
                  <Icon
                    className={cn(
                      "w-10 h-10 transition-colors",
                      isSelected ? "text-accent" : "text-muted-foreground group-hover:text-accent",
                    )}
                  />
                  {multiSelect && isSelected && (
                    <CheckCircle2 className="absolute -top-1.5 -right-1.5 w-5 h-5 text-accent animate-fade-in" />
                  )}
                </div>
                <span className="text-sm font-semibold text-foreground">{trade.label}</span>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Save Combination Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Trade Combination</DialogTitle>
            <DialogDescription>
              Name this combination of {selected.size} trade{selected.size !== 1 ? "s" : ""} for quick access later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="combo-name" className="text-xs text-muted-foreground">
                Combination Name
              </Label>
              <Input
                id="combo-name"
                value={comboName}
                onChange={e => setComboName(e.target.value)}
                placeholder="e.g., MEP Package"
                className="mt-1"
                onKeyDown={e => { if (e.key === "Enter") handleSaveCombination(); }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selected).map(v => {
                const label = SELECTABLE_TRADES.find(t => t.value === v)?.label || v;
                return (
                  <Badge key={v} variant="secondary" className="text-xs">
                    {label}
                  </Badge>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCombination}
              disabled={!comboName.trim()}
              className="gradient-accent text-accent-foreground font-semibold shadow-accent hover:opacity-90 transition-opacity"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
