import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, MaterialPreset, LaborPreset } from "@/lib/app-context";
import { TRADES, UNITS } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X, ArrowRight, ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  { id: "trade", title: "Default Trade", description: "Select the trade you work in most often" },
  { id: "materials", title: "Material Pricing", description: "Add materials you already know the cost of" },
  { id: "labor", title: "Labor Rates", description: "Set your crew's actual hourly rates" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { settings, updateSettings, markOnboardingComplete } = useApp();
  const [step, setStep] = useState(0);

  // Trade selection
  const [selectedTrade, setSelectedTrade] = useState(settings.presetTrade || "");

  // Material presets (local state for this wizard)
  const [materials, setMaterials] = useState<MaterialPreset[]>(settings.materialPresets);
  const [newMatName, setNewMatName] = useState("");
  const [newMatPrice, setNewMatPrice] = useState("");
  const [newMatUnit, setNewMatUnit] = useState("each");

  // Labor presets
  const [laborRates, setLaborRates] = useState<LaborPreset[]>(settings.laborPresets);
  const [newLaborRole, setNewLaborRole] = useState("");
  const [newLaborRate, setNewLaborRate] = useState("");

  const addMaterial = () => {
    if (!newMatName.trim() || !newMatPrice) return;
    const preset: MaterialPreset = { id: Date.now().toString(), name: newMatName.trim(), unitPrice: parseFloat(newMatPrice), unit: newMatUnit };
    setMaterials(prev => [...prev, preset]);
    setNewMatName(""); setNewMatPrice(""); setNewMatUnit("each");
  };

  const removeMaterial = (id: string) => setMaterials(prev => prev.filter(m => m.id !== id));

  const addLabor = () => {
    if (!newLaborRole.trim() || !newLaborRate) return;
    const preset: LaborPreset = { id: Date.now().toString(), role: newLaborRole.trim(), hourlyRate: parseFloat(newLaborRate) };
    setLaborRates(prev => [...prev, preset]);
    setNewLaborRole(""); setNewLaborRate("");
  };

  const removeLabor = (id: string) => setLaborRates(prev => prev.filter(l => l.id !== id));

  const saveAndContinue = () => {
    // Save current step's data
    if (step === 0) {
      updateSettings({ presetTrade: selectedTrade === "none" ? "" : selectedTrade });
    } else if (step === 1) {
      updateSettings({ materialPresets: materials });
    } else if (step === 2) {
      updateSettings({ laborPresets: laborRates });
    }

    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      finishOnboarding();
    }
  };

  const skipStep = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      finishOnboarding();
    }
  };

  const finishOnboarding = async () => {
    await markOnboardingComplete();
    toast.success("You're all set!", { description: "You can update these anytime in Settings." });
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-xl space-y-6 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-extrabold text-foreground">Welcome! Let's set you up</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The more info you include, the more accurate your estimates will be. You can always change these later in Settings.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? "bg-accent text-accent-foreground" : i === step ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 h-0.5 ${i < step ? "bg-accent" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <Card className="p-6 shadow-card">
          <h2 className="text-lg font-semibold text-foreground mb-1">{STEPS[step].title}</h2>
          <p className="text-xs text-muted-foreground mb-5">{STEPS[step].description}</p>

          {/* Step 0: Trade Selection */}
          {step === 0 && (
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">What trade do you primarily work in?</Label>
              <Select value={selectedTrade || "none"} onValueChange={setSelectedTrade}>
                <SelectTrigger><SelectValue placeholder="Select your trade..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (I'll pick each time)</SelectItem>
                  {TRADES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <span>{t.label}</span>
                      {"subtitle" in t && <span className="text-muted-foreground ml-1 text-xs">— {t.subtitle}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">This will auto-fill on new estimates. You can always override per-job.</p>
            </div>
          )}

          {/* Step 1: Material Pricing */}
          {step === 1 && (
            <div className="space-y-4">
              {materials.length > 0 && (
                <div className="space-y-2">
                  {materials.map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-foreground flex-1 truncate">{m.name}</span>
                      <Badge variant="secondary" className="text-xs">{m.unit}</Badge>
                      <span className="text-sm font-mono font-medium text-foreground">${m.unitPrice.toFixed(2)}</span>
                      <Button variant="ghost" size="sm" onClick={() => removeMaterial(m.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </Button>
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
              <p className="text-[10px] text-muted-foreground">These override AI-sourced pricing when a matching material is found in your estimate.</p>
            </div>
          )}

          {/* Step 2: Labor Rates */}
          {step === 2 && (
            <div className="space-y-4">
              {laborRates.length > 0 && (
                <div className="space-y-2">
                  {laborRates.map(l => (
                    <div key={l.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-foreground flex-1 truncate">{l.role}</span>
                      <span className="text-sm font-mono font-medium text-foreground">${l.hourlyRate.toFixed(2)}/hr</span>
                      <Button variant="ghost" size="sm" onClick={() => removeLabor(l.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </Button>
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
              <p className="text-[10px] text-muted-foreground">These override BLS wage data when a matching role is found in your estimate.</p>
            </div>
          )}
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div>
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)} className="text-muted-foreground">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={skipStep} className="text-muted-foreground text-sm">
              Set Up Later
            </Button>
            <Button onClick={saveAndContinue} className="gradient-accent text-accent-foreground font-semibold">
              {step === STEPS.length - 1 ? "Finish Setup" : "Continue"}
              {step < STEPS.length - 1 && <ArrowRight className="w-4 h-4 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
