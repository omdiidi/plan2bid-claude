import { useState, useRef } from "react";
import { X, Mic, Square, Loader2, CheckCircle2, Send, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createScenario, transcribeVoice } from "@/lib/api";
import type { Scenario } from "@/types";

interface ScenarioCreatorProps {
  projectId: string;
  parentScenario?: Scenario | null;
  scenarioCount: number;
  onCreated: (scenario: Scenario) => void;
  onClose: () => void;
}

export default function ScenarioCreator({
  projectId,
  parentScenario,
  scenarioCount,
  onCreated,
  onClose,
}: ScenarioCreatorProps) {
  const [name, setName] = useState(`Scenario ${scenarioCount + 1}`);
  const [context, setContext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing" | "done">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleVoice = async () => {
    if (voiceState === "idle") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          setVoiceState("processing");
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          try {
            const result = await transcribeVoice(audioBlob);
            if (result.text) {
              setContext(prev => prev ? `${prev} ${result.text}` : result.text);
              toast.success("Voice transcribed", { description: `${result.duration_seconds.toFixed(1)}s processed.` });
            }
            setVoiceState("done");
            setTimeout(() => setVoiceState("idle"), 1500);
          } catch {
            toast.error("Transcription failed");
            setVoiceState("idle");
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setVoiceState("recording");
      } catch {
        toast.error("Microphone access denied");
      }
    } else if (voiceState === "recording") {
      mediaRecorderRef.current?.stop();
    }
  };

  const handleSubmit = async () => {
    const trimmed = context.trim();
    if (trimmed.length < 10) {
      toast.error("Context too short", { description: "Please describe the scenario in at least 10 characters." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await createScenario(projectId, {
        name: name.trim() || `Scenario ${scenarioCount + 1}`,
        context: trimmed,
        parent_scenario_id: parentScenario?.id,
      });
      toast.success("Scenario created", { description: "Generation started in the background." });
      onCreated({
        id: res.scenario_id,
        project_id: projectId,
        name: name.trim() || `Scenario ${scenarioCount + 1}`,
        context: trimmed,
        status: res.status as Scenario["status"],
        progress: 0,
        parent_scenario_id: parentScenario?.id ?? null,
        summary: null,
        error_message: null,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      toast.error("Failed to create scenario", { description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:max-w-sm md:max-w-md bg-background border-l border-border shadow-2xl z-50 flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">New Scenario</h3>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Parent indicator */}
        {parentScenario && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
            Branching from: <span className="font-medium text-foreground">{parentScenario.name}</span>
            {parentScenario.summary && <p className="mt-1 text-muted-foreground">{parentScenario.summary}</p>}
          </div>
        )}

        {/* Scenario Name */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Scenario Name</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Value Engineering"
            className="h-9 text-sm"
          />
        </div>

        {/* Context */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            What changes should this scenario explore?
          </label>
          <Textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="Describe the scenario modifications... e.g., 'Use architectural shingles instead of 3-tab, add ice dam protection along eaves, upgrade underlayment to synthetic'"
            className="min-h-[120px] text-sm resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-muted-foreground">
              {context.trim().length < 10 ? `${10 - context.trim().length} more chars needed` : "Ready"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-2 ${voiceState === "recording" ? "text-destructive animate-pulse" : voiceState === "processing" ? "text-accent" : "text-muted-foreground"}`}
              onClick={handleVoice}
              disabled={voiceState === "processing"}
            >
              {voiceState === "recording" ? <Square className="w-4 h-4" /> : voiceState === "processing" ? <Loader2 className="w-4 h-4 animate-spin" /> : voiceState === "done" ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Mic className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Info */}
        <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-3 space-y-1">
          <p>The scenario will re-run material pricing and labor estimation with your modifications applied as overrides.</p>
          <p>Stage 3 extraction data (quantities, specs) stays the same — only pricing assumptions change.</p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <Button
          className="w-full gap-2"
          disabled={submitting || context.trim().length < 10}
          onClick={handleSubmit}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? "Creating..." : "Generate Scenario"}
        </Button>
      </div>
    </div>
  );
}
