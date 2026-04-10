import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { TRADES, FACILITY_TYPES, PROJECT_TYPES } from "@/lib/constants";
import { countWords, formatFileSize } from "@/lib/utils";
import { createEstimate, validateDescription, transcribeVoice, polishText, ApiError } from "@/lib/api";
import type { ValidationQuestion, TradeCombination } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, X, FileArchive, FileText, FileImage, Mic, Loader2, CheckCircle2, AlertTriangle, Info, HelpCircle, Square, RotateCcw, ArrowRight, Sparkles, FolderOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import AddressAutocomplete from "@/components/AddressAutocomplete";

function buildAnswerContext(
  questions: ValidationQuestion[],
  answers: Record<string, string>,
): string {
  const lines = questions
    .filter(q => answers[q.id]?.trim())
    .map(q => `Q: ${q.question}\nA: ${answers[q.id].trim()}`);
  if (lines.length === 0) return "";
  return `\n\n--- Pre-Estimation Clarifications ---\n${lines.join("\n\n")}`;
}

export default function NewEstimate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const questionsRef = useRef<HTMLDivElement>(null);

  // Cleanup MediaRecorder if component unmounts while recording
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Set webkitdirectory on folder input (not in JSX types)
  const supportsFolderUpload = typeof HTMLInputElement !== "undefined" && "webkitdirectory" in HTMLInputElement.prototype;
  useEffect(() => {
    if (folderInputRef.current && supportsFolderUpload) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
    }
  }, [supportsFolderUpload]);

  // Form state
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [facilityType, setFacilityType] = useState("");
  const [facilityTypeOther, setFacilityTypeOther] = useState("");
  const [projectType, setProjectType] = useState("");
  const [projectTypeOther, setProjectTypeOther] = useState("");
  const [trade, setTrade] = useState(settings.presetTrade || "");
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  // Tracks the Select dropdown value — may be a trade value, "__run_all__", or "__combo__{id}"
  const [tradeSelectKey, setTradeSelectKey] = useState(settings.presetTrade || "");
  const [description, setDescription] = useState("");
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing" | "done">("idle");
  const [polishingDescription, setPolishingDescription] = useState(false);
  const [polishingAnswer, setPolishingAnswer] = useState<string | null>(null); // question id being polished

  // Validation state
  const [validationState, setValidationState] = useState<"idle" | "loading" | "success" | "questions" | "error">("idle");
  const [validationQuestions, setValidationQuestions] = useState<ValidationQuestion[]>([]);
  const [validationSummary, setValidationSummary] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const wordCount = countWords(description);
  const MAX_FILE_SIZE = 250 * 1024 * 1024;

  // Auto-select trade from settings preset (only if no URL params override)
  useEffect(() => {
    const tradesParam = searchParams.get("trades");
    if (tradesParam) return; // URL params take priority
    const preset = settings.presetTrade;
    if (!preset || trade) return; // no preset or already set

    if (preset === "__run_all__") {
      setTrade("general_contractor");
      setSelectedTrades([]);
      setTradeSelectKey("__run_all__");
    } else if (preset.startsWith("__combo__")) {
      const comboId = preset.replace("__combo__", "");
      const combo = (settings.savedCombinations || []).find(c => c.id === comboId);
      if (combo) {
        setTrade("general_contractor");
        setSelectedTrades(combo.trades);
        setTradeSelectKey(preset);
      }
    } else {
      setTrade(preset);
      setTradeSelectKey(preset);
    }
  }, [settings.presetTrade]);

  // Read trades from URL search params (set by SelectTrades page)
  const savedCombos = settings.savedCombinations || [];
  useEffect(() => {
    const tradesParam = searchParams.get("trades");
    if (!tradesParam) return;

    if (tradesParam === "all") {
      setTrade("general_contractor");
      setSelectedTrades([]);
      setTradeSelectKey("__run_all__");
    } else {
      const tradesList = tradesParam.split(",").filter(Boolean);
      if (tradesList.length === 1) {
        setTrade(tradesList[0]);
        setSelectedTrades(tradesList);
        setTradeSelectKey(tradesList[0]);
      } else if (tradesList.length > 1) {
        setTrade("general_contractor");
        setSelectedTrades(tradesList);
        // Check if this matches a saved combination
        const matchedCombo = savedCombos.find(c =>
          c.trades.length === tradesList.length && c.trades.every(t => tradesList.includes(t))
        );
        setTradeSelectKey(matchedCombo ? `__combo__${matchedCombo.id}` : "__custom__");
      }
    }
  }, [searchParams]);

  // Derive the display label for the trade select trigger
  const SELECTABLE_TRADES = useMemo(() => TRADES.filter(t => t.value !== "general_contractor"), []);

  const tradeDisplayLabel = useMemo(() => {
    if (tradeSelectKey === "__run_all__") return "Run All Trades";
    if (tradeSelectKey === "__custom__") {
      return `Custom (${selectedTrades.length} trades)`;
    }
    if (tradeSelectKey.startsWith("__combo__")) {
      const comboId = tradeSelectKey.replace("__combo__", "");
      const combo = savedCombos.find(c => c.id === comboId);
      return combo ? `${combo.name} (${combo.trades.length})` : "Saved Combo";
    }
    const found = TRADES.find(t => t.value === tradeSelectKey);
    return found ? found.label : undefined;
  }, [tradeSelectKey, selectedTrades, savedCombos]);

  // File handling — supports multiple PDFs, ZIPs, and folders
  const ALLOWED_EXTENSIONS = [".pdf", ".zip", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".heic"];

  const handleFiles = useCallback((newFiles: File[], fromFolder: boolean) => {
    const valid: File[] = [];
    let skippedCount = 0;

    for (const f of newFiles) {
      const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        skippedCount++;
        if (!fromFolder) {
          toast.error("Invalid file type", { description: `${f.name} — accepted: PDF, JPG, PNG, TIFF, HEIC, ZIP.` });
        }
        continue;
      }
      valid.push(f);
    }

    if (fromFolder && skippedCount > 0) {
      toast.info(`Skipped ${skippedCount} non-PDF file${skippedCount > 1 ? "s" : ""}`);
    }

    if (valid.length === 0) return;

    // Compute dedup + size check OUTSIDE the state updater (no side effects in updaters)
    setFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}|${f.size}|${f.lastModified}`));
      const deduped = valid.filter(f => !existing.has(`${f.name}|${f.size}|${f.lastModified}`));
      if (deduped.length === 0) return prev;

      const currentSize = prev.reduce((s, f) => s + f.size, 0);
      const newSize = deduped.reduce((s, f) => s + f.size, 0);
      if (currentSize + newSize > MAX_FILE_SIZE) {
        // Schedule toast outside the updater to avoid side-effect in pure function
        setTimeout(() => toast.error("Size limit exceeded", { description: "Adding these files would exceed the 250 MB limit." }), 0);
        return prev;
      }
      return [...prev, ...deduped];
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) handleFiles(droppedFiles, false);
  }, [handleFiles]);

  // Real validation via backend API
  const triggerValidation = useCallback(async () => {
    if (wordCount < 50 || !settings.enableValidation) return;
    setValidationState("loading");
    const finalFT = facilityType === "other" ? `other:${facilityTypeOther.trim()}` : facilityType;
    const finalPT = projectType === "other" ? `other:${projectTypeOther.trim()}` : projectType;
    try {
      const result = await validateDescription({
        project_name: projectName,
        street_address: address,
        city,
        state: state.toUpperCase(),
        zip_code: zip,
        facility_type: finalFT,
        project_type: finalPT,
        trade,
        description,
      });

      if (result._error) {
        setValidationState("error");
        return;
      }

      if (result.valid && (!result.questions || result.questions.length === 0)) {
        setValidationSummary(result.summary);
        setValidationState("success");
      } else if (result.questions && result.questions.length > 0) {
        setValidationSummary(result.summary);
        setValidationQuestions(result.questions);
        setAnswers({});
        setValidationState("questions");
      } else {
        setValidationState("success");
      }
    } catch {
      setValidationState("error");
    }
  }, [wordCount, settings.enableValidation, projectName, address, city, state, zip, facilityType, facilityTypeOther, projectType, projectTypeOther, trade, description]);

  // Reset validation when key inputs change — forces user to press Continue again
  const validationStateRef = useRef(validationState);
  validationStateRef.current = validationState;
  useEffect(() => {
    if (validationStateRef.current === "success" || validationStateRef.current === "questions") {
      setValidationState("idle");
      setValidationQuestions([]);
      setAnswers({});
    }
  }, [description, facilityType, facilityTypeOther, projectType, projectTypeOther, trade]);

  // Auto-scroll to clarification questions when they appear
  useEffect(() => {
    if (validationState === "questions" && questionsRef.current) {
      setTimeout(() => {
        questionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [validationState]);

  // Handle trade dropdown change — syncs trade, selectedTrades, and tradeSelectKey
  const handleTradeChange = useCallback((value: string) => {
    if (value === "__run_all__") {
      setTrade("general_contractor");
      setSelectedTrades([]);
      setTradeSelectKey("__run_all__");
    } else if (value.startsWith("__combo__")) {
      const comboId = value.replace("__combo__", "");
      const combo = savedCombos.find(c => c.id === comboId);
      if (combo) {
        setTrade("general_contractor");
        setSelectedTrades(combo.trades);
        setTradeSelectKey(value);
      }
    } else {
      // Single trade selected — clear any multi-trade state
      setTrade(value);
      setSelectedTrades([]);
      setTradeSelectKey(value);
    }
  }, [savedCombos]);

  // Real voice recording + transcription via backend API
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
              setDescription(prev => prev ? `${prev} ${result.text}` : result.text);
              toast.success("Voice transcribed", { description: `${result.duration_seconds.toFixed(1)}s of audio processed.` });
            }
            setVoiceState("done");
            setTimeout(() => setVoiceState("idle"), 1500);
          } catch {
            toast.error("Transcription failed", { description: "Could not transcribe audio. Try again or type manually." });
            setVoiceState("idle");
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setVoiceState("recording");
      } catch {
        toast.error("Microphone access denied", { description: "Please allow microphone access to use voice input." });
      }
    } else if (voiceState === "recording") {
      mediaRecorderRef.current?.stop();
    }
  };

  const handlePolishDescription = async () => {
    if (!description.trim() || polishingDescription) return;
    setPolishingDescription(true);
    try {
      const polished = await polishText(description);
      setDescription(polished);
      toast.success("Text polished");
    } catch {
      toast.error("Polish failed", { description: "Could not polish text. Try again." });
    } finally {
      setPolishingDescription(false);
    }
  };

  const handlePolishAnswer = async (questionId: string) => {
    const text = answers[questionId]?.trim();
    if (!text || polishingAnswer) return;
    setPolishingAnswer(questionId);
    try {
      const polished = await polishText(text);
      setAnswers(prev => ({ ...prev, [questionId]: polished }));
      toast.success("Answer polished");
    } catch {
      toast.error("Polish failed", { description: "Could not polish text. Try again." });
    } finally {
      setPolishingAnswer(null);
    }
  };

  const answeredCount = Object.values(answers).filter(a => a.trim().length > 0).length;
  const totalQuestions = validationQuestions.length;
  const allAnswered = totalQuestions > 0 && answeredCount === totalQuestions;
  const validationPassed = !settings.enableValidation || validationState === "success" || (validationState === "questions" && allAnswered) || validationState === "error";

  // Missing items for tooltip
  const missing: string[] = [];
  if (files.length === 0) missing.push("Upload at least one document file");
  if (!projectName.trim()) missing.push("Project name");
  if (!city.trim()) missing.push("City");
  if (!state.trim()) missing.push("State");
  if (!facilityType) missing.push("Facility type");
  if (facilityType === "other" && !facilityTypeOther.trim()) missing.push("Describe facility type");
  if (!projectType) missing.push("Project type");
  if (projectType === "other" && !projectTypeOther.trim()) missing.push("Describe project type");
  if (!trade) missing.push("Trade");
  if (wordCount < 50) missing.push(`Description (${wordCount}/50 words)`);
  if (!validationPassed && validationState !== "idle") missing.push("Complete validation questions");

  const canSubmit = missing.length === 0;

  // Real form submission via backend API
  const handleSubmit = async () => {
    if (!canSubmit || files.length === 0) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const finalFacilityType = facilityType === "other" ? `other:${facilityTypeOther.trim()}` : facilityType;
    const finalProjectType = projectType === "other" ? `other:${projectTypeOther.trim()}` : projectType;

    const formData = new FormData();
    formData.append("zip_file", files[0]);
    formData.append("project_name", projectName);
    formData.append("street_address", address);
    formData.append("city", city);
    formData.append("state", state.toUpperCase());
    formData.append("zip_code", zip);
    formData.append("facility_type", finalFacilityType);
    formData.append("project_type", finalProjectType);
    formData.append("trade", trade);
    // Append selected_trades for multi-trade / run-all support
    if (trade === "general_contractor" && selectedTrades.length === 0) {
      // Run All mode: empty array signals backend to run all trades
      formData.append("selected_trades", JSON.stringify([]));
    } else if (selectedTrades.length > 0) {
      formData.append("selected_trades", JSON.stringify(selectedTrades));
    } else {
      // Direct navigation or single trade from dropdown
      formData.append("selected_trades", JSON.stringify([trade]));
    }
    const answerContext = buildAnswerContext(validationQuestions, answers);
    formData.append("project_description", description + answerContext);

    try {
      const { job_id } = await createEstimate(formData);
      toast.success("Estimate started", { description: "Your documents are being processed." });
      navigate(`/progress/${job_id}`);
    } catch (err) {
      const isApiErr = err instanceof ApiError;
      const detail = err instanceof Error ? err.message : String(err);
      const status = isApiErr ? err.status : undefined;
      const extra = isApiErr ? err.details : undefined;
      const fullMsg = [
        `Status: ${status ?? "unknown"}`,
        `Message: ${detail}`,
        extra ? `Details: ${typeof extra === "string" ? extra : JSON.stringify(extra)}` : null,
      ].filter(Boolean).join(" | ");
      if (import.meta.env.DEV) console.error("[Estim8r] Estimate submission failed:", fullMsg, err);
      setSubmitError(fullMsg);
      toast.error("Submission failed", { description: detail });
      setIsSubmitting(false);
    }
  };

  const isGC = trade === "general_contractor";

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">New Estimate</h1>
        <p className="text-muted-foreground mt-1">Upload your blueprint package and fill in project details — <span className="text-warning font-medium">Please only include files with information about the project you wish to price. Do not include non-relevant documentation.</span></p>
      </div>

      {/* File Upload */}
      <Card className="p-6 shadow-card">
        <Label className="text-sm font-semibold text-foreground mb-3 block">Blueprint Package</Label>

        {/* Drop zone — always active for drag-and-drop */}
        <div
          className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
            files.length > 0 ? "p-4" : "p-10"
          } ${dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/50 hover:bg-muted/50"}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className={`${files.length > 0 ? "w-6 h-6 mb-1" : "w-10 h-10 mb-3"} mx-auto ${dragOver ? "text-accent" : "text-muted-foreground/40"}`} />
          {files.length === 0 ? (
            <>
              <p className="text-sm font-medium text-foreground">Drop files, ZIPs, or a folder here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Drop more files here</p>
          )}
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.zip,.jpg,.jpeg,.png,.tiff,.tif,.heic"
          className="hidden"
          onChange={e => {
            if (e.target.files?.length) {
              handleFiles(Array.from(e.target.files), false);
              e.target.value = "";
            }
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          onChange={e => {
            if (e.target.files?.length) {
              handleFiles(Array.from(e.target.files), true);
              e.target.value = "";
            }
          }}
        />

        {/* File list */}
        {files.length > 0 && (
          <div className="mt-3 space-y-1 max-h-[200px] overflow-y-auto">
            {files.map((f, idx) => (
              <div key={`${f.name}-${f.size}-${f.lastModified}`} className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-lg">
                {f.name.toLowerCase().endsWith(".zip") ? (
                  <FileArchive className="w-5 h-5 text-accent flex-shrink-0" />
                ) : /\.(jpe?g|png|tiff?|heic)$/i.test(f.name) ? (
                  <FileImage className="w-5 h-5 text-accent flex-shrink-0" />
                ) : (
                  <FileText className="w-5 h-5 text-accent flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{formatFileSize(f.size)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Summary + action buttons */}
        {files.length > 0 && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Total: {files.length} file{files.length !== 1 ? "s" : ""} · {formatFileSize(files.reduce((s, f) => s + f.size, 0))}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => fileInputRef.current?.click()}>
                <Plus className="w-3 h-3" />
                Add Files
              </Button>
              {supportsFolderUpload && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => folderInputRef.current?.click()}>
                  <FolderOpen className="w-3 h-3" />
                  Add Folder
                </Button>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-2">PDF, JPG, PNG, TIFF, HEIC, or ZIP archives — Max 250 MB total</p>
      </Card>

      {/* Project Info */}
      <Card className="p-6 shadow-card">
        <h2 className="text-sm font-semibold text-foreground mb-4">Project Information</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name" className="text-xs text-muted-foreground">Project Name *</Label>
            <Input id="name" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g., Downtown Office Renovation" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="address" className="text-xs text-muted-foreground">Street Address</Label>
            <AddressAutocomplete
              id="address"
              value={address}
              onChange={setAddress}
              onSelect={({ street, city: c, state: s, zip: z }) => {
                setAddress(street);
                setCity(c);
                setState(s);
                setZip(z);
              }}
              placeholder="e.g., 123 Main St"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="city" className="text-xs text-muted-foreground">City *</Label>
              <Input id="city" value={city} onChange={e => setCity(e.target.value)} placeholder="Austin" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="state" className="text-xs text-muted-foreground">State *</Label>
              <Input id="state" value={state} onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="TX" maxLength={2} className="mt-1 uppercase" />
            </div>
            <div>
              <Label htmlFor="zip" className="text-xs text-muted-foreground">ZIP Code</Label>
              <Input id="zip" value={zip} onChange={e => setZip(e.target.value.slice(0, 10))} placeholder="78701" maxLength={10} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Facility Type *</Label>
              <Select value={facilityType} onValueChange={v => { setFacilityType(v); if (v !== "other") setFacilityTypeOther(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  {FACILITY_TYPES.map(ft => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Affects site condition labor adjustments</p>
              {facilityType === "other" && (
                <div className="mt-2">
                  <Input placeholder="Describe the facility type..." value={facilityTypeOther} onChange={e => { if (countWords(e.target.value) <= 50) setFacilityTypeOther(e.target.value); }} />
                  <span className={`text-[10px] mt-0.5 block ${countWords(facilityTypeOther) === 0 ? "text-muted-foreground" : countWords(facilityTypeOther) >= 50 ? "text-warning" : "text-muted-foreground"}`}>{countWords(facilityTypeOther)}/50 words</span>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Project Type *</Label>
              <Select value={projectType} onValueChange={v => { setProjectType(v); if (v !== "other") setProjectTypeOther(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map(pt => <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Defines the scope of work</p>
              {projectType === "other" && (
                <div className="mt-2">
                  <Input placeholder="Describe the project type..." value={projectTypeOther} onChange={e => { if (countWords(e.target.value) <= 50) setProjectTypeOther(e.target.value); }} />
                  <span className={`text-[10px] mt-0.5 block ${countWords(projectTypeOther) === 0 ? "text-muted-foreground" : countWords(projectTypeOther) >= 50 ? "text-warning" : "text-muted-foreground"}`}>{countWords(projectTypeOther)}/50 words</span>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Trade *</Label>
              <Select value={tradeSelectKey} onValueChange={handleTradeChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select trade...">{tradeDisplayLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="text-xs text-muted-foreground px-2">Individual Trades</SelectLabel>
                    {SELECTABLE_TRADES.map(t => (
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
            </div>
          </div>

          {isGC && selectedTrades.length === 0 && (
            <div className="flex items-start gap-2 p-3 bg-accent/10 rounded-lg border border-accent/20 animate-fade-in">
              <Info className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
              <p className="text-xs text-foreground">
                <strong>Run All mode</strong> will run all trades in parallel and deduplicate shared items across trades.
              </p>
            </div>
          )}

          {selectedTrades.length > 1 && (
            <div className="flex items-start gap-2 p-3 bg-accent/10 rounded-lg border border-accent/20 animate-fade-in">
              <Info className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
              <p className="text-xs text-foreground">
                <strong>Multi-trade mode:</strong> Running {selectedTrades.length} trades — {selectedTrades.map(t =>
                  TRADES.find(tr => tr.value === t)?.label || t
                ).join(", ")}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Description */}
      <Card className="p-6 shadow-card">
        <div className="flex items-center justify-between mb-1">
          <Label className="text-sm font-semibold text-foreground">Project Description *</Label>
          <span className={`text-xs font-mono ${wordCount === 0 ? "text-muted-foreground" : wordCount < 50 ? "text-warning" : "text-success"}`}>
            {wordCount}/50 words
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Include: type of work (new install, retrofit, replacement) · building conditions (occupied, phased, access restrictions) · exclusions or carve-outs · known site conditions or prior work · addenda or change orders · special requirements (overtime, after-hours, hazmat)
        </p>
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={6}
          autoResize
          className="min-h-[160px]"
          placeholder="Describe your project scope..."
        />

        {/* Voice Input + Polish + Continue — inside the card */}
        <div className="flex items-center justify-between mt-4">
          {/* Mic + Polish buttons */}
          <div className="flex items-center gap-4">
            {/* Mic button */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative">
                {voiceState === "recording" && (
                  <span className="absolute inset-0 rounded-full bg-destructive/20 animate-ping" />
                )}
                <Button
                  variant={voiceState === "recording" ? "destructive" : "outline"}
                  size="icon"
                  className={`w-12 h-12 rounded-full relative ${
                    voiceState === "recording" ? "shadow-lg" : voiceState === "processing" ? "text-accent border-accent" : voiceState === "done" ? "text-success border-success" : ""
                  }`}
                  onClick={handleVoice}
                  disabled={voiceState === "processing"}
                >
                  {voiceState === "recording" ? (
                    <Square className="w-5 h-5" />
                  ) : voiceState === "processing" ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : voiceState === "done" ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )}
                </Button>
              </div>
              <span className={`text-[11px] ${voiceState === "recording" ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {voiceState === "recording" ? "Recording... tap to stop" : voiceState === "processing" ? "Transcribing..." : voiceState === "done" ? "Done" : "Voice Input"}
              </span>
            </div>

            {/* Polish Text button */}
            <div className="flex flex-col items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="w-12 h-12 rounded-full text-accent border-accent/30 hover:bg-accent/5 hover:border-accent/40 transition-all duration-200"
                onClick={handlePolishDescription}
                disabled={polishingDescription || !description.trim()}
              >
                {polishingDescription ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Sparkles className="w-6 h-6" />
                )}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {polishingDescription ? "Polishing..." : "Polish Text"}
              </span>
            </div>
          </div>

          {/* Continue / Loading — inline, same position */}
          {wordCount >= 50 && settings.enableValidation && (validationState === "idle" || validationState === "loading") && (
            validationState === "loading" ? (
              <div className="flex items-center gap-3 min-w-[160px] justify-center animate-fade-in">
                <Loader2 className="w-5 h-5 text-accent animate-spin" />
                <span className="text-sm text-muted-foreground">Reviewing your description...</span>
              </div>
            ) : (
              <Button
                onClick={() => triggerValidation()}
                size="lg"
                disabled={!facilityType || !projectType || !trade}
                className="font-semibold gap-2 min-w-[160px] gradient-accent text-accent-foreground shadow-accent border-0 transition-all duration-200 hover:scale-105 hover:shadow-lg animate-fade-in disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </Button>
            )
          )}
        </div>
      </Card>

      {/* Validation State */}
      {validationState === "success" && (
        <Card className="p-5 shadow-card border-success/30 bg-success/5 animate-slide-up">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-success" />
            <div>
              <p className="text-sm font-medium text-foreground">Description validated</p>
              <p className="text-xs text-muted-foreground">{validationSummary || "Scope, conditions, and requirements are clear. Ready to generate estimate."}</p>
            </div>
          </div>
        </Card>
      )}

      {validationState === "error" && (
        <Card className="p-5 shadow-card border-warning/30 bg-warning/5 animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Validation service unavailable</p>
                <p className="text-xs text-muted-foreground">You can still proceed. The AI will work with the description as-is.</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-warning hover:text-warning hover:bg-warning/10"
              onClick={() => triggerValidation()}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              <span className="text-xs">Retry</span>
            </Button>
          </div>
        </Card>
      )}

      {validationState === "questions" && (
        <Card ref={questionsRef} className="p-0 shadow-card border-accent/20 animate-slide-up overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border bg-accent/5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-accent" />
              Clarification Questions
            </h3>
            {validationSummary && (
              <p className="text-xs text-muted-foreground mt-1">{validationSummary}</p>
            )}
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              Answer the following before generating your estimate. These details can't be read from the drawings.
            </p>
          </div>

          {/* Questions */}
          <div className="divide-y divide-border">
            {validationQuestions.map((q, i) => (
              <div key={q.id} className="px-6 py-4">
                <label htmlFor={`vq-${q.id}`} className="flex items-start gap-2.5 text-sm text-foreground mb-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent text-[11px] font-semibold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span>{q.question}</span>
                </label>
                <div className="relative ml-7">
                  <Textarea
                    id={`vq-${q.id}`}
                    rows={2}
                    autoResize
                    className="pr-[110px]"
                    placeholder={q.placeholder || "Your answer..."}
                    value={answers[q.id] || ""}
                    onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute bottom-2 right-2 h-7 px-2.5 gap-1.5 rounded-md text-accent border-accent/30 bg-card hover:bg-accent/5 hover:border-accent/40 transition-all duration-150 shadow-sm"
                    onClick={() => handlePolishAnswer(q.id)}
                    disabled={polishingAnswer === q.id || !answers[q.id]?.trim()}
                  >
                    {polishingAnswer === q.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span className="text-[11px] font-medium">Polish</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-border bg-muted/30">
            {allAnswered ? (
              <div>
                <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {answeredCount}/{totalQuestions} answered
                </span>
                {missing.filter(m => m !== "Complete validation questions").length > 0 && (
                  <p className="text-[10px] text-warning mt-1">
                    Still needed: {missing.filter(m => m !== "Complete validation questions").join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {answeredCount}/{totalQuestions} answered
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Submit Error Banner */}
      {submitError && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive">Estimate submission failed</p>
              <p className="text-xs text-destructive/80 mt-1 break-all font-mono">{submitError}</p>
              <button
                onClick={() => setSubmitError(null)}
                className="text-xs text-muted-foreground hover:text-foreground mt-2 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Submit — only visible after validation passes */}
      {validationPassed && (
        <div className="flex justify-end pb-8 animate-fade-in">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  size="lg"
                  disabled={!canSubmit || isSubmitting}
                  onClick={handleSubmit}
                  className="gradient-accent text-accent-foreground font-semibold shadow-accent hover:opacity-90 transition-opacity disabled:opacity-50 disabled:shadow-none min-w-[200px]"
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                  ) : (
                    "Generate Estimate"
                  )}
                </Button>
              </div>
            </TooltipTrigger>
            {!canSubmit && (
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs font-medium mb-1">Missing required fields:</p>
                <ul className="text-xs space-y-0.5">
                  {missing.map((m, i) => <li key={i}>• {m}</li>)}
                </ul>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      )}
    </div>
  );
}
