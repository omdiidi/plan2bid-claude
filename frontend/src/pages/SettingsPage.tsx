import { useState } from "react";
import { useApp, MaterialPreset, LaborPreset } from "@/lib/app-context";
import { TRADES, UNITS } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Upload, Mail, Headphones, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import ComboTooltip from "@/components/ComboTooltip";
import SubcontractorManager from "@/components/settings/SubcontractorManager";

export default function SettingsPage() {
  const { settings, updateSettings } = useApp();
  const { theme, setTheme } = useTheme();
  const savedCombos = settings.savedCombinations || [];

  // Local state for new entries
  const [newMatName, setNewMatName] = useState("");
  const [newMatPrice, setNewMatPrice] = useState("");
  const [newMatUnit, setNewMatUnit] = useState("each");
  const [newLaborRole, setNewLaborRole] = useState("");
  const [newLaborRate, setNewLaborRate] = useState("");

  const addMaterial = () => {
    if (!newMatName.trim() || !newMatPrice) return;
    const preset: MaterialPreset = { id: Date.now().toString(), name: newMatName.trim(), unitPrice: parseFloat(newMatPrice), unit: newMatUnit };
    updateSettings({ materialPresets: [...settings.materialPresets, preset] });
    setNewMatName(""); setNewMatPrice(""); setNewMatUnit("each");
    toast.success("Material preset added");
  };

  const removeMaterial = (id: string) => {
    updateSettings({ materialPresets: settings.materialPresets.filter(m => m.id !== id) });
  };

  const addLabor = () => {
    if (!newLaborRole.trim() || !newLaborRate) return;
    const preset: LaborPreset = { id: Date.now().toString(), role: newLaborRole.trim(), hourlyRate: parseFloat(newLaborRate) };
    updateSettings({ laborPresets: [...settings.laborPresets, preset] });
    setNewLaborRole(""); setNewLaborRate("");
    toast.success("Labor rate added");
  };

  const removeLabor = (id: string) => {
    updateSettings({ laborPresets: settings.laborPresets.filter(l => l.id !== id) });
  };

  const apiKeys = [
    { name: "Reducto API", desc: "Document parsing", connected: true },
    { name: "OpenRouter API", desc: "AI agents", connected: true },
    { name: "OpenAI API", desc: "Voice input", connected: false },
    { name: "BLS API", desc: "Labor wage rates", connected: true },
    { name: "Perplexity API", desc: "Material pricing", connected: true },
  ];


  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-extrabold text-foreground">Settings</h1>

      <Tabs defaultValue="general">
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="support" className="gap-1.5">
            <Headphones className="w-3.5 h-3.5" />Customer Support
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">

      {/* Preset Trade */}
      <Card className="p-6 shadow-card">
        <h2 className="text-sm font-semibold text-foreground mb-3">Default Trade</h2>
        <p className="text-xs text-muted-foreground mb-3">Auto-fill this trade on new estimates. You can always override per-job.</p>
        <Select value={settings.presetTrade || "none"} onValueChange={v => updateSettings({ presetTrade: v === "none" ? "" : v })}>
          {(() => {
            const v = settings.presetTrade;
            const activeCombo = v?.startsWith("__combo__")
              ? savedCombos.find(c => c.id === v.replace("__combo__", ""))
              : null;

            const trigger = (
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="None (ask every time)">
                  {(() => {
                    if (!v || v === "none") return "None (ask every time)";
                    if (v === "__run_all__") return "Run All Trades";
                    if (activeCombo) return `${activeCombo.name} (${activeCombo.trades.length} trades)`;
                    return TRADES.find(t => t.value === v)?.label ?? v;
                  })()}
                </SelectValue>
              </SelectTrigger>
            );

            return activeCombo
              ? <ComboTooltip trades={activeCombo.trades}>{trigger}</ComboTooltip>
              : trigger;
          })()}
          <SelectContent>
            <SelectItem value="none">None (ask every time)</SelectItem>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground px-2">Individual Trades</SelectLabel>
              {TRADES.filter(t => t.value !== "general_contractor").map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground px-2">Multi-Trade</SelectLabel>
              <SelectItem value="__run_all__">Run All Trades</SelectItem>
              {savedCombos.map(c => (
                <SelectItem key={c.id} value={`__combo__${c.id}`}>
                  {c.name} ({c.trades.length} trades)
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Card>

      {/* Markup, Overhead, Contingency & Waste */}
      <Card className="p-6 shadow-card">
        <h2 className="text-sm font-semibold text-foreground mb-1">Markup, Overhead, Contingency & Waste</h2>
        <p className="text-xs text-muted-foreground mb-4">Markup/overhead/contingency apply to subtotals in Final Pricing. Waste applies to material quantities.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Markup %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={settings.markupPercent}
              onChange={e => updateSettings({ markupPercent: parseFloat(e.target.value) || 0 })}
              className="mt-1 h-9"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Profit margin on total cost</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Overhead %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={settings.overheadPercent}
              onChange={e => updateSettings({ overheadPercent: parseFloat(e.target.value) || 0 })}
              className="mt-1 h-9"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Office, insurance, admin costs</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Contingency %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={settings.contingencyPercent}
              onChange={e => updateSettings({ contingencyPercent: parseFloat(e.target.value) || 0 })}
              className="mt-1 h-9"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Buffer for unknowns & risk</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Default Waste %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={settings.wasteDefaultPercent}
              onChange={e => updateSettings({ wasteDefaultPercent: parseFloat(e.target.value) || 0 })}
              className="mt-1 h-9"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Material waste factor per item</p>
          </div>
        </div>
      </Card>

      {/* Material Presets */}
      <Card className="p-6 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Material Price Overrides</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Override AI pricing for specific materials you know the cost of.</p>
          </div>
        </div>

        {settings.materialPresets.length > 0 && (
          <div className="space-y-2 mb-4">
            {settings.materialPresets.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-foreground flex-1 truncate">{m.name}</span>
                <Badge variant="secondary" className="text-xs">{m.unit}</Badge>
                <span className="text-sm font-mono font-medium text-foreground">${m.unitPrice.toFixed(2)}</span>
                <Button variant="ghost" size="sm" onClick={() => removeMaterial(m.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-[10px] text-muted-foreground">Material name</Label>
            <Input value={newMatName} onChange={e => setNewMatName(e.target.value)} placeholder='e.g., 20A single-pole breaker' className="mt-0.5 h-9" />
          </div>
          <div className="w-24">
            <Label className="text-[10px] text-muted-foreground">Unit</Label>
            <Select value={newMatUnit} onValueChange={setNewMatUnit}>
              <SelectTrigger className="mt-0.5 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <Label className="text-[10px] text-muted-foreground">Price ($)</Label>
            <Input type="number" step="0.01" value={newMatPrice} onChange={e => setNewMatPrice(e.target.value)} placeholder="12.50" className="mt-0.5 h-9" />
          </div>
          <Button size="sm" onClick={addMaterial} disabled={!newMatName.trim() || !newMatPrice} className="h-9 gradient-accent text-accent-foreground">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* Labor Presets */}
      <Card className="p-6 shadow-card">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-foreground">Labor Rate Overrides</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Override BLS wage rates with your actual crew rates.</p>
        </div>

        {settings.laborPresets.length > 0 && (
          <div className="space-y-2 mb-4">
            {settings.laborPresets.map(l => (
              <div key={l.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-foreground flex-1 truncate">{l.role}</span>
                <span className="text-sm font-mono font-medium text-foreground">${l.hourlyRate.toFixed(2)}/hr</span>
                <Button variant="ghost" size="sm" onClick={() => removeLabor(l.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-[10px] text-muted-foreground">Role / Trade</Label>
            <Input value={newLaborRole} onChange={e => setNewLaborRole(e.target.value)} placeholder="e.g., Journeyman Electrician" className="mt-0.5 h-9" />
          </div>
          <div className="w-32">
            <Label className="text-[10px] text-muted-foreground">Rate ($/hr)</Label>
            <Input type="number" step="0.01" value={newLaborRate} onChange={e => setNewLaborRate(e.target.value)} placeholder="65.00" className="mt-0.5 h-9" />
          </div>
          <Button size="sm" onClick={addLabor} disabled={!newLaborRole.trim() || !newLaborRate} className="h-9 gradient-accent text-accent-foreground">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        
      </Card>

      {/* Subcontractors */}
      <SubcontractorManager />

      {/* File / Description Settings */}
      <Card className="p-6 shadow-card">
        <h2 className="text-sm font-semibold text-foreground mb-3">Upload & Description</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="text-foreground">Max file size</p>
              <p className="text-xs text-muted-foreground">Backend enforced</p>
            </div>
            <Badge variant="secondary">500 MB</Badge>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="text-foreground">Accepted file types (inside ZIP)</p>
              <p className="text-xs text-muted-foreground">PDF, TIFF, PNG, JPG</p>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="text-foreground">Auto-skipped file types</p>
              <p className="text-xs text-muted-foreground">.dwg, .rvt, .docx, .xlsx — skipped with reasons shown</p>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="text-foreground">Minimum description length</p>
            </div>
            <Badge variant="secondary">50 words</Badge>
          </div>
        </div>
      </Card>

      {/* Appearance */}
      <Card className="p-6 shadow-card">
        <h2 className="text-sm font-semibold text-foreground mb-1">Appearance</h2>
        <p className="text-xs text-muted-foreground mb-4">Switch between light and dark mode.</p>
        <div className="flex items-center gap-3">
          <Sun className={`w-4 h-4 ${theme === "dark" ? "text-muted-foreground" : "text-warning"}`} />
          <Switch
            checked={theme === "dark"}
            onCheckedChange={(dark) => {
              const next = dark ? "dark" : "light";
              setTheme(next);
              updateSettings({ theme: next });
            }}
          />
          <Moon className={`w-4 h-4 ${theme === "dark" ? "text-accent" : "text-muted-foreground"}`} />
          <span className="text-sm text-muted-foreground ml-1">{theme === "dark" ? "Dark" : "Light"}</span>
        </div>
      </Card>

        </TabsContent>

        <TabsContent value="support" className="space-y-6">
          {/* Contact Info */}
          <Card className="p-6 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">Contact Us</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Have a question, found a bug, or need help with your estimate? Reach out to our support team.
            </p>
            <a
              href="mailto:hello@plan2bid.com"
              className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
            >
              <Mail className="w-3.5 h-3.5" />
              hello@plan2bid.com
            </a>
          </Card>

        </TabsContent>
      </Tabs>

    </div>
  );
}
