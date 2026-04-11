import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getEstimateStatus, type EstimateStatus } from "@/lib/api";
import { CheckCircle2, Circle, Loader2, XCircle, AlertTriangle, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

// ─── Theme constants (tweak colors/effects here) ────────────────────────────
const THEME = {
  // Background gradients
  bgGradient: "linear-gradient(155deg, #0a1628 0%, #0f1d32 35%, #162640 65%, #0d1a2e 100%)",
  bgWhiteBlur: "radial-gradient(ellipse, rgba(30,60,120,.25) 0%, transparent 68%)",
  bgBlueBlur: "radial-gradient(ellipse, rgba(40,100,220,.15) 0%, transparent 70%)",
  bgCenterGlow: "radial-gradient(circle, rgba(60,120,220,.12) 0%, transparent 68%)",
  // Hub
  hubGlow: "radial-gradient(circle, rgba(40,80,160,.3) 35%, rgba(60,120,220,.15) 65%, transparent 85%)",
  hubBorder: "rgba(100,170,255,.25)",
  hubBg: "rgba(12,22,45,.75)",
  hubShadow: "0 8px 40px rgba(30,80,180,.2), inset 0 2px 0 rgba(80,140,255,.15), 0 0 0 1px rgba(60,120,220,.2)",
  // Cards
  cardBg: "rgba(12,22,45,.6)",
  cardBorder: "rgba(80,150,255,.2)",
  cardShadow: "0 4px 22px rgba(10,30,80,.3), inset 0 1px 0 rgba(80,140,255,.1)",
  cardIconBg: "rgba(40,80,160,.3)",
  cardIconBorder: "rgba(70,140,255,.2)",
  cardIconStroke: "#7ab4e8",
  // Progress ring
  ringTrack: "rgba(60,120,220,.2)",
  ringGradientStart: "#90ccff",
  ringGradientEnd: "#2260ff",
  // Lines
  lineStroke: "rgba(70,140,255,.25)",
  dotFill: "rgba(90,170,255,.65)",
  // Sparkles
  sparkleFill: "rgba(80,160,255,.7)",
  // Spinner arc
  arcBorder: "rgba(100,160,255,.25)",
  arcTop: "#4a9eff",
  // Text
  pctColor: "#e2e8f0",
  labelColor: "#e2e8f0",
  subColor: "#7a9dc2",
  cardTitleColor: "#e2e8f0",
  cardSubColor: "#7a9dc2",
  dotColor: "#4a9eff",
  // Dashes
  dashBorder: "rgba(70,140,255,.2)",
  dash2Border: "rgba(60,120,220,.2)",
} as const;

// ─── Stage mapping (visual stages — worker reports ingestion + extraction, rest are interpolated) ─
const STAGE_DISPLAY: Record<string, { name: string; subtitle: string }> = {
  queued:        { name: "Starting Estimation",          subtitle: "Preparing your estimate..." },
  ingestion:     { name: "File Upload & Extraction",     subtitle: "Extracting and validating documents from ZIP" },
  parsing:       { name: "Document Parsing",             subtitle: "Parsing pages" },
  classification:{ name: "Document Classification",      subtitle: "Classifying documents by type and relevance" },
  brief:         { name: "Project Brief Generation",     subtitle: "Generating project brief from documents" },
  extraction:    { name: "Trade Extraction",             subtitle: "Extracting trade-specific line items" },
  context:       { name: "Site Intelligence",            subtitle: "Analyzing site conditions and logistics" },
  pricing_labor: { name: "Pricing & Labor Estimation",   subtitle: "Material pricing and labor costs (parallel)" },
};

const STAGE_ORDER = [
  "ingestion",
  "parsing",
  "classification",
  "brief",
  "extraction",
  "context",
  "pricing_labor",
];

type StageUIStatus = "pending" | "running" | "completed" | "failed";

function getStageStatus(stageKey: string, currentStage: string, pipelineStatus: string): StageUIStatus {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const stageIdx = STAGE_ORDER.indexOf(stageKey);

  if (pipelineStatus === "completed") return "completed";
  if (pipelineStatus === "failed" || pipelineStatus === "error") {
    if (stageIdx < currentIdx) return "completed";
    if (stageIdx === currentIdx) return "failed";
    return "pending";
  }
  // currentStage not in our list — mark everything pending
  if (currentIdx === -1) return "pending";
  if (stageIdx < currentIdx) return "completed";
  if (stageIdx === currentIdx) return "running";
  return "pending";
}

// ─── Design canvas constants (desktop reference size) ────────────────────────
// max-w-7xl (1280) minus lg:px-8 padding (64) = 1216; maxHeight 600
const DESIGN_W = 1216;
const DESIGN_H = 600;
const SCALE_THRESHOLD = 650; // only apply canvas scaling above this container width

// ─── SVG constants ───────────────────────────────────────────────────────────
const RING_R = 135;
const RING_C = 2 * Math.PI * RING_R; // ≈ 848.23

// Hub center & card anchor points (from the HTML design, scaled to viewBox 1440×810)
const HUB = { x: 720, y: 408 };
const CARD_ANCHORS = [
  { x: 402, y: 233 },  // TL
  { x: 1038, y: 233 }, // TR
  { x: 302, y: 408 },  // ML
  { x: 1178, y: 412 }, // MR
  { x: 404, y: 585 },  // BL
  { x: 1016, y: 585 }, // BR
];

// ─── Floating category cards (visual only) ───────────────────────────────────
const CATEGORY_CARDS = [
  {
    label: "Scope Analysis", sub: "Analyzing specifications...",
    pos: "top-[23%] left-[19.6%]", delay: "0s",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={THEME.cardIconStroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="12" height="16" rx="1.5" /><line x1="7" y1="7" x2="13" y2="7" /><line x1="7" y1="10" x2="13" y2="10" /><line x1="7" y1="13" x2="10" y2="13" />
        <circle cx="17" cy="17" r="3.2" /><line x1="19.3" y1="19.3" x2="22" y2="22" />
      </svg>
    ),
  },
  {
    label: "Equipment Logistics", sub: "Timeline analysis...",
    pos: "top-[23%] left-[63.8%]", delay: "0.7s",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={THEME.cardIconStroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="11" width="14" height="8" rx="1" /><polyline points="2,11 6,6 14,6 16,11" /><rect x="16" y="13" width="6" height="6" rx="1" />
        <line x1="16" y1="16" x2="22" y2="16" /><circle cx="6" cy="20" r="1.8" /><circle cx="18.5" cy="20" r="1.8" />
      </svg>
    ),
  },
  {
    label: "Materials", sub: "Lumber / steel / supplies...",
    pos: "top-[45.7%] left-[12.6%]", delay: "1.4s",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={THEME.cardIconStroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="13" width="9" height="7" rx="1" /><rect x="7" y="8" width="9" height="7" rx="1" /><rect x="13" y="4" width="9" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Pricing Engine", sub: "Calculating rates...",
    pos: "top-[46.1%] left-[73.5%]", delay: "2.1s",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={THEME.cardIconStroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" /><rect x="7" y="5" width="10" height="4" rx="0.8" strokeWidth="1.2" />
        <line x1="8" y1="12" x2="8" y2="12" strokeWidth="2" strokeLinecap="round" /><line x1="12" y1="12" x2="12" y2="12" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="12" x2="16" y2="12" strokeWidth="2" strokeLinecap="round" /><line x1="8" y1="15.5" x2="8" y2="15.5" strokeWidth="2" strokeLinecap="round" />
        <line x1="12" y1="15.5" x2="12" y2="15.5" strokeWidth="2" strokeLinecap="round" /><line x1="16" y1="15.5" x2="16" y2="18.5" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Labor Estimation", sub: "Calculating costs...",
    pos: "top-[67.4%] left-[19.7%]", delay: "2.8s",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={THEME.cardIconStroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4C9 3 10 2 12 2s3 1 3 2H9z" /><path d="M5 5h14v1.5A7 7 0 0 1 5 6.5V5z" />
        <circle cx="12" cy="15.5" r="5" /><polyline points="12,13 12,15.5 14,15.5" />
      </svg>
    ),
  },
  {
    label: "Risk Assessment", sub: "Confidence scoring...",
    pos: "top-[67.4%] left-[62.2%]", delay: "3.5s",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={THEME.cardIconStroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3,18 8,11 13,14 21,6" />
        <polygon points="12,1 14.2,7.8 21,9 16,13.8 17.4,21 12,17.7 6.6,21 8,13.8 3,9 9.8,7.8" strokeWidth="1.2" fill="rgba(100,160,255,.12)" />
        <line x1="12" y1="9" x2="12" y2="13" strokeWidth="1.8" /><circle cx="12" cy="15.5" r=".8" fill={THEME.cardIconStroke} />
      </svg>
    ),
  },
];

// ─── Trade progress parsing ──────────────────────────────────────────────────
interface TradeProgress {
  name: string;
  done: boolean;
}

function parseTradeProgress(message: string, logs: EstimateStatus["logs"]): TradeProgress[] {
  // Try to parse "Extracted 2/5 trades — Electrical: 42 items" or "Priced & estimated 3/5 trades — Plumbing done"
  const trades: TradeProgress[] = [];

  // Gather completed trades from logs
  const doneSet = new Set<string>();
  if (logs) {
    for (const log of logs) {
      // "Extracted electrical: 42 items (30 material, 12 labor)"
      const extMatch = log.message.match(/^Extracted (\w+):/i);
      if (extMatch) doneSet.add(extMatch[1].toLowerCase());
      // "Priced & estimated 2/3 trades — Electrical done"
      const pricedMatch = log.message.match(/trades? — (.+?) done$/i);
      if (pricedMatch) doneSet.add(pricedMatch[1].toLowerCase().replace(/\s+/g, "_"));
    }
  }

  // Extract current trade from message
  const msgTradeMatch = message.match(/— (.+?)(?:: \d| done)/i);
  const currentTrade = msgTradeMatch ? msgTradeMatch[1].toLowerCase().replace(/\s+/g, "_") : null;

  // Build list from done trades + current
  for (const t of doneSet) {
    trades.push({ name: t, done: true });
  }
  if (currentTrade && !doneSet.has(currentTrade)) {
    trades.push({ name: currentTrade, done: false });
  }

  return trades;
}

function formatTradeName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Sparkle SVG ─────────────────────────────────────────────────────────────
function Sparkle({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`absolute pointer-events-none animate-loader-sparkle ${className ?? ""}`} style={style}>
      <svg viewBox="0 0 24 24" className="w-full h-full" fill={THEME.sparkleFill}>
        <path d="M12 2l1.8 8.2L22 12l-8.2 1.8L12 22l-1.8-8.2L2 12l8.2-1.8z" />
      </svg>
    </div>
  );
}

// ─── Stage list icon ─────────────────────────────────────────────────────────
function StageIcon({ status }: { status: StageUIStatus }) {
  switch (status) {
    case "completed": return <CheckCircle2 className="w-5 h-5 text-success" />;
    case "running":   return <Loader2 className="w-5 h-5 text-accent animate-spin" />;
    case "failed":    return <XCircle className="w-5 h-5 text-destructive" />;
    default:          return <Circle className="w-5 h-5 text-muted-foreground/40" />;
  }
}

// ─── Preview simulation (TEMPORARY — remove when done testing) ───────────────
const PREVIEW_STAGES: { stage: string; progress: number; message: string }[] = [
  { stage: "ingestion", progress: 2, message: "Processing uploaded files..." },
  { stage: "ingestion", progress: 5, message: "Ingested 12 documents" },
  { stage: "parsing", progress: 10, message: "Parsing documents..." },
  { stage: "parsing", progress: 30, message: "Parsed 8/12 documents..." },
  { stage: "classification", progress: 36, message: "Classifying documents..." },
  { stage: "classification", progress: 40, message: "Classification complete" },
  { stage: "brief", progress: 41, message: "Generating project brief..." },
  { stage: "brief", progress: 45, message: "Brief complete" },
  { stage: "extraction", progress: 50, message: "Extracting 3 trades..." },
  { stage: "extraction", progress: 55, message: "Extracted 1/3 trades — Electrical: 42 items" },
  { stage: "extraction", progress: 60, message: "Extracted 2/3 trades — Plumbing: 28 items" },
  { stage: "extraction", progress: 65, message: "Extracted 3/3 trades — HVAC: 35 items" },
  { stage: "context", progress: 66, message: "Analyzing site conditions..." },
  { stage: "pricing_labor", progress: 68, message: "Pricing materials and estimating labor (3 trades)..." },
  { stage: "pricing_labor", progress: 74, message: "Priced & estimated 1/3 trades — Electrical done" },
  { stage: "pricing_labor", progress: 80, message: "Priced & estimated 2/3 trades — Plumbing done" },
  { stage: "pricing_labor", progress: 85, message: "Materials: $142,500 | Labor: $98,200 (3+3 trades)" },
];

function usePreviewSimulation(): EstimateStatus | null {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(prev => (prev + 1) % PREVIEW_STAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const s = PREVIEW_STAGES[step];
  const logs = PREVIEW_STAGES.slice(0, step + 1).map((ps, i) => ({
    timestamp: new Date(Date.now() - (step - i) * 2000).toISOString(),
    level: "info" as const,
    message: ps.message,
  }));

  return {
    status: "running",
    stage: s.stage,
    message: s.message,
    progress: s.progress,
    logs,
  };
}

// ─── Main component ──────────────────────────────────────────────────────────
const POLL_INTERVAL = 2000;

export default function Progress() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const isPreview = projectId === "preview";

  const [status, setStatus] = useState<EstimateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Measure visualization container for canvas scaling (iPad optimization)
  const vizRef = useRef<HTMLDivElement>(null);
  const [vizScale, setVizScale] = useState(1);
  const [vizUseCanvas, setVizUseCanvas] = useState(false);
  useEffect(() => {
    const el = vizRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      const wide = w >= SCALE_THRESHOLD;
      setVizUseCanvas(wide);
      setVizScale(wide ? Math.min(w / DESIGN_W, h / DESIGN_H, 1) : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Preview simulation (TEMPORARY)
  const previewStatus = usePreviewSimulation();

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    if (!projectId || isPreview) return;
    try {
      const data = await getEstimateStatus(projectId);
      setStatus(data);
      setError(null);

      if (data.status === "completed" || data.status === "error") {
        stopPolling();
        if (data.status === "error" && data.error) {
          toast.error("Pipeline failed", { description: data.error });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [projectId, isPreview, stopPolling]);

  const pollRef = useRef(poll);
  pollRef.current = poll;

  useEffect(() => {
    if (isPreview) return;
    pollRef.current();
    pollingRef.current = setInterval(() => pollRef.current(), POLL_INTERVAL);
    return stopPolling;
  }, [stopPolling, isPreview]);

  // Use preview data when in preview mode, real data otherwise
  const activeStatus = isPreview ? previewStatus : status;

  const isComplete = activeStatus?.status === "completed";
  const isFailed = activeStatus?.status === "error";
  // Queue state handled inline — no separate banner, progress starts immediately
  const serverProgress = activeStatus?.progress ?? 0;
  const currentStage = activeStatus?.stage ?? "";
  const logs = activeStatus?.logs ?? [];

  // Smooth progress interpolation — worker only reports 5% and 10%, then jumps to completed.
  // We interpolate the displayed progress to avoid a jarring 10% → 100% jump.
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    const isRunning = activeStatus?.status === "running" || activeStatus?.status === "queued";

    if (!isRunning) {
      setDisplayProgress(activeStatus?.status === "completed" ? 100 : serverProgress);
      return;
    }

    // Jump to at least server progress
    setDisplayProgress(prev => Math.max(serverProgress, prev));

    const interval = setInterval(() => {
      setDisplayProgress(prev => {
        if (prev >= 90) return 90; // Cap at 90% while running
        const remaining = 90 - prev;
        const increment = Math.max(0.3, remaining * 0.02);
        return Math.min(90, prev + increment);
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [activeStatus?.status, serverProgress]);

  const progress = displayProgress;
  const stageDisplay = STAGE_DISPLAY[currentStage] ?? { name: currentStage, subtitle: "" };

  // Progress ring dasharray
  const ringDash = (progress / 100) * RING_C;

  // Trade progress for extraction / pricing_labor stages
  const tradeProgress = useMemo(() => {
    if (!activeStatus) return [];
    if (currentStage !== "extraction" && currentStage !== "pricing_labor") return [];
    return parseTradeProgress(activeStatus.message, activeStatus.logs);
  }, [activeStatus, currentStage]);

  return (
    <div className="animate-fade-in">
      {/* ── Animated Loading Visualization ── */}
      {!isComplete && !isFailed && (
        <div ref={vizRef} className="relative w-full overflow-hidden rounded-2xl mb-6" style={{ background: THEME.bgGradient, aspectRatio: "16/9", maxHeight: "600px" }}>
          {/* Background blurs — outside canvas, fill outer container */}
          <div className="absolute -top-[120px] -left-[120px] w-[52%] h-[80%]" style={{ background: THEME.bgWhiteBlur }} />
          <div className="absolute -bottom-[80px] -right-[40px] w-[43%] h-[64%]" style={{ background: THEME.bgBlueBlur }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[39%] h-[69%]" style={{ background: THEME.bgCenterGlow }} />

          {/* Connecting dotted lines SVG — outside canvas, scales via viewBox */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1440 810" preserveAspectRatio="xMidYMid meet">
            <defs>
              <filter id="loader-glow"><feGaussianBlur stdDeviation="1.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              <linearGradient id="loader-ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={THEME.ringGradientStart} />
                <stop offset="100%" stopColor={THEME.ringGradientEnd} />
              </linearGradient>
              <filter id="loader-ring-glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>

            {/* Dotted lines from hub to each card */}
            <g stroke={THEME.lineStroke} strokeWidth="1.2" strokeDasharray="5 6" fill="none">
              {CARD_ANCHORS.map((pt, i) => (
                <line key={i} x1={HUB.x} y1={HUB.y} x2={pt.x} y2={pt.y} />
              ))}
            </g>

            {/* Glowing dots traveling along lines */}
            <g fill={THEME.dotFill} filter="url(#loader-glow)">
              {CARD_ANCHORS.map((pt, i) => {
                const dur = [3.2, 2.8, 3.6, 3.0, 3.4, 2.6][i];
                return (
                  <circle key={i} r="2.5">
                    <animate attributeName="cx" from={HUB.x} to={pt.x} dur={`${dur}s`} repeatCount="indefinite" />
                    <animate attributeName="cy" from={HUB.y} to={pt.y} dur={`${dur}s`} repeatCount="indefinite" />
                  </circle>
                );
              })}
            </g>
          </svg>

          {vizUseCanvas ? (
            /* ── Tablet/Desktop: scaled design canvas ── */
            <div
              className="absolute top-1/2 left-1/2 pointer-events-none"
              style={{
                width: DESIGN_W,
                height: DESIGN_H,
                transform: `translate(-50%, -50%) scale(${vizScale})`,
                transformOrigin: "center center",
              }}
            >
              {/* Central hub */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-auto">
                <div className="relative w-[380px] h-[380px] flex items-center justify-center">
                  <div className="absolute -inset-[18px] rounded-full blur-[10px]" style={{ background: THEME.hubGlow }} />
                  <div className="absolute -inset-[32px] rounded-full" style={{ border: `1.5px dashed ${THEME.dashBorder}` }} />
                  <div className="absolute -inset-[8px] rounded-full" style={{ border: `1px solid ${THEME.dash2Border}` }} />
                  <svg className="absolute w-[310px] h-[310px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" viewBox="0 0 310 310">
                    <circle cx="155" cy="155" r={RING_R} fill="none" stroke={THEME.ringTrack} strokeWidth="7" />
                    <circle cx="155" cy="155" r={RING_R} fill="none" stroke="url(#loader-ring-grad)" strokeWidth="7.5" strokeLinecap="round" strokeDasharray={`${ringDash} ${RING_C}`} transform="rotate(-90 155 155)" filter="url(#loader-ring-glow)" style={{ transition: "stroke-dasharray 1s ease-out" }} />
                  </svg>
                  <div className="w-[252px] h-[252px] rounded-full flex flex-col items-center justify-center relative z-[3] backdrop-blur-[28px]" style={{ background: THEME.hubBg, border: `1px solid ${THEME.hubBorder}`, boxShadow: THEME.hubShadow }}>
                    <div className="w-[18px] h-[18px] rounded-full animate-loader-spin mb-1.5" style={{ border: `2.5px solid ${THEME.arcBorder}`, borderTopColor: THEME.arcTop }} />
                    <div className="text-[60px] font-light leading-none tracking-[-3px]" style={{ color: THEME.pctColor }}>{Math.round(progress)}%</div>
                    <div className="flex items-center gap-[7px] mt-[7px]">
                      <span className="text-[10px] font-extrabold tracking-[2.8px] uppercase" style={{ color: THEME.labelColor }}>Estimating</span>
                      <div className="flex gap-[3px]">{[0, 0.22, 0.44].map((delay, i) => (<span key={i} className="block w-1 h-1 rounded-full" style={{ background: THEME.dotColor, animation: `loader-dot-pulse 1.4s ease-in-out ${delay}s infinite` }} />))}</div>
                    </div>
                    <div className="text-[10.5px] text-center mt-[5px] max-w-[115px] leading-[1.5]" style={{ color: THEME.subColor }}>{stageDisplay.subtitle || "Compiling smart bid proposal..."}</div>
                  </div>
                </div>
              </div>

              {/* Floating category cards */}
              {CATEGORY_CARDS.map((card, i) => (
                <div key={i} className={`absolute ${card.pos} z-[15] w-[240px] rounded-[17px] p-[15px_18px] flex items-center gap-[14px] animate-loader-float pointer-events-auto`} style={{ background: THEME.cardBg, backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)", border: `1px solid ${THEME.cardBorder}`, boxShadow: THEME.cardShadow, animationDelay: card.delay }}>
                  <div className="min-w-[46px] w-[46px] h-[46px] rounded-[11px] flex items-center justify-center" style={{ background: THEME.cardIconBg, border: `1px solid ${THEME.cardIconBorder}` }}>{card.icon}</div>
                  <div>
                    <h3 className="text-[10.5px] font-extrabold tracking-[1.3px] uppercase" style={{ color: THEME.cardTitleColor }}>{card.label}</h3>
                    <p className="text-[10.5px] mt-0.5" style={{ color: THEME.cardSubColor }}>{card.sub}</p>
                  </div>
                </div>
              ))}

              <Sparkle className="bottom-[38px] right-[56px] w-[30px] h-[30px]" />
              <Sparkle className="top-[78px] right-[145px] w-[17px] h-[17px]" style={{ animationDelay: "0.9s" }} />
              <Sparkle className="bottom-[108px] right-[88px] w-[13px] h-[13px]" style={{ animationDelay: "1.8s" }} />
              <Sparkle className="top-[160px] left-[155px] w-[11px] h-[11px]" style={{ animationDelay: "1.2s" }} />

              <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 pointer-events-auto">
                <div className="w-[42px] h-[42px] rounded-[11px] flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, #4899f0, #1b6fd8)" }}>
                  <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="white"><path d="M12 3L4 20h3.5l1.5-4h6l1.5 4H20L12 3zm-1.8 10 1.8-5 1.8 5H10.2z" /></svg>
                </div>
                <h1 className="text-[20px] font-medium tracking-[0.3px]" style={{ color: "#e2e8f0" }}>Plan2Bid &nbsp;|&nbsp; Processing Estimate</h1>
              </div>
            </div>
          ) : (
            /* ── Phone/small: hub-only + decorations at sm+ ── */
            <>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <div className="relative w-[180px] h-[180px] sm:w-[340px] sm:h-[340px] flex items-center justify-center">
                  <div className="absolute -inset-[14px] sm:-inset-[18px] rounded-full blur-[10px]" style={{ background: THEME.hubGlow }} />
                  <div className="absolute -inset-[24px] sm:-inset-[32px] rounded-full" style={{ border: `1.5px dashed ${THEME.dashBorder}` }} />
                  <div className="absolute -inset-[6px] sm:-inset-[8px] rounded-full" style={{ border: `1px solid ${THEME.dash2Border}` }} />
                  <svg className="absolute w-[165px] h-[165px] sm:w-[310px] sm:h-[310px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" viewBox="0 0 310 310">
                    <circle cx="155" cy="155" r={RING_R} fill="none" stroke={THEME.ringTrack} strokeWidth="7" />
                    <circle cx="155" cy="155" r={RING_R} fill="none" stroke="url(#loader-ring-grad)" strokeWidth="7.5" strokeLinecap="round" strokeDasharray={`${ringDash} ${RING_C}`} transform="rotate(-90 155 155)" filter="url(#loader-ring-glow)" style={{ transition: "stroke-dasharray 1s ease-out" }} />
                  </svg>
                  <div className="w-[135px] h-[135px] sm:w-[252px] sm:h-[252px] rounded-full flex flex-col items-center justify-center relative z-[3] backdrop-blur-[28px]" style={{ background: THEME.hubBg, border: `1px solid ${THEME.hubBorder}`, boxShadow: THEME.hubShadow }}>
                    <div className="w-[18px] h-[18px] rounded-full animate-loader-spin mb-1.5" style={{ border: `2.5px solid ${THEME.arcBorder}`, borderTopColor: THEME.arcTop }} />
                    <div className="text-[36px] sm:text-[60px] font-light leading-none tracking-[-3px]" style={{ color: THEME.pctColor }}>{Math.round(progress)}%</div>
                    <div className="flex items-center gap-[7px] mt-[5px] sm:mt-[7px]">
                      <span className="text-[9px] sm:text-[10px] font-extrabold tracking-[2.8px] uppercase" style={{ color: THEME.labelColor }}>Estimating</span>
                      <div className="flex gap-[3px]">{[0, 0.22, 0.44].map((delay, i) => (<span key={i} className="block w-1 h-1 rounded-full" style={{ background: THEME.dotColor, animation: `loader-dot-pulse 1.4s ease-in-out ${delay}s infinite` }} />))}</div>
                    </div>
                    <div className="text-[9px] sm:text-[10.5px] text-center mt-[4px] sm:mt-[5px] max-w-[100px] sm:max-w-[115px] leading-[1.5]" style={{ color: THEME.subColor }}>{stageDisplay.subtitle || "Compiling smart bid proposal..."}</div>
                  </div>
                </div>
              </div>

              {/* Decorative elements: hidden on phones, visible on sm+ (640px+) */}
              <div className="hidden sm:contents">
                {CATEGORY_CARDS.map((card, i) => (
                  <div key={i} className={`absolute ${card.pos} z-[15] w-[240px] rounded-[17px] p-[15px_18px] flex items-center gap-[14px] animate-loader-float`} style={{ background: THEME.cardBg, backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)", border: `1px solid ${THEME.cardBorder}`, boxShadow: THEME.cardShadow, animationDelay: card.delay }}>
                    <div className="min-w-[46px] w-[46px] h-[46px] rounded-[11px] flex items-center justify-center" style={{ background: THEME.cardIconBg, border: `1px solid ${THEME.cardIconBorder}` }}>{card.icon}</div>
                    <div>
                      <h3 className="text-[10.5px] font-extrabold tracking-[1.3px] uppercase" style={{ color: THEME.cardTitleColor }}>{card.label}</h3>
                      <p className="text-[10.5px] mt-0.5" style={{ color: THEME.cardSubColor }}>{card.sub}</p>
                    </div>
                  </div>
                ))}

                <Sparkle className="bottom-[38px] right-[56px] w-[30px] h-[30px]" />
                <Sparkle className="top-[78px] right-[145px] w-[17px] h-[17px]" style={{ animationDelay: "0.9s" }} />
                <Sparkle className="bottom-[108px] right-[88px] w-[13px] h-[13px]" style={{ animationDelay: "1.8s" }} />
                <Sparkle className="top-[160px] left-[155px] w-[11px] h-[11px]" style={{ animationDelay: "1.2s" }} />

                <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
                  <div className="w-[42px] h-[42px] rounded-[11px] flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, #4899f0, #1b6fd8)" }}>
                    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="white"><path d="M12 3L4 20h3.5l1.5-4h6l1.5 4H20L12 3zm-1.8 10 1.8-5 1.8 5H10.2z" /></svg>
                  </div>
                  <h1 className="text-[20px] font-medium tracking-[0.3px]" style={{ color: "#e2e8f0" }}>Plan2Bid &nbsp;|&nbsp; Processing Estimate</h1>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Status text ── */}
      <div className="max-w-3xl mx-auto space-y-4">
        {!isComplete && !isFailed && (
          <p className="text-sm text-muted-foreground text-center">
            {activeStatus?.message || "Starting pipeline..."}
          </p>
        )}

        {/* ── Error Banner ── */}
        {isFailed && (
          <Card className="p-6 shadow-card border-destructive/30 bg-destructive/5 animate-slide-up">
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-foreground">Pipeline Failed</p>
                <p className="text-sm text-muted-foreground mt-1">{activeStatus?.error || "An unexpected error occurred."}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/select-trades")}>
                  Try Again
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Network Error ── */}
        {error && !status && (
          <Card className="p-6 shadow-card border-warning/30 bg-warning/5 animate-slide-up">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-warning" />
              <div>
                <p className="font-semibold text-foreground">Connection Error</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {/* ── Completion Banner ── */}
        {isComplete && (
          <Card className="p-6 shadow-card border-success/30 bg-success/5 animate-slide-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-success" />
                <div>
                  <p className="font-semibold text-foreground">Estimate Complete</p>
                  <p className="text-sm text-muted-foreground">
                    {activeStatus?.warnings?.length
                      ? `Completed with ${activeStatus.warnings.length} warning${activeStatus.warnings.length > 1 ? "s" : ""}`
                      : "All stages completed successfully"}
                  </p>
                </div>
              </div>
              <Button onClick={() => navigate(`/results/${projectId}`)} className="gradient-accent text-accent-foreground font-semibold shadow-accent">
                View Results <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* ── Warnings Banner ── */}
        {isComplete && (activeStatus?.warnings?.length ?? 0) > 0 && (
          <Card className="p-5 shadow-card border-warning/30 bg-warning/5 animate-slide-up">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-foreground text-sm">
                  Estimate completed with {activeStatus!.warnings!.length} warning{activeStatus!.warnings!.length > 1 ? "s" : ""}
                </p>
                <ul className="mt-2 space-y-1">
                  {activeStatus!.warnings!.map((w, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-warning mt-0.5">&#x2022;</span>
                      <span>{w.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        )}

        {/* ── Stage Task List ── */}
        <Card className="p-5 shadow-card">
          <h2 className="text-sm font-semibold text-foreground mb-3">Pipeline Stages</h2>
          <div className="space-y-0.5">
            {STAGE_ORDER.map((key) => {
              const stageInfo = STAGE_DISPLAY[key] ?? { name: key, subtitle: "" };
              const uiStatus = activeStatus ? getStageStatus(key, currentStage, activeStatus.status) : "pending";
              const isParallel = key === "pricing_labor";
              const isTradeStage = key === "extraction" || key === "pricing_labor";
              const showTrades = isTradeStage && uiStatus === "running" && tradeProgress.length > 0;

              return (
                <div key={key}>
                  <div className={`flex items-start gap-3 px-3 py-2 rounded-lg transition-colors ${uiStatus === "running" ? "bg-accent/5" : ""}`}>
                    <div className="mt-0.5"><StageIcon status={uiStatus} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${uiStatus === "pending" ? "text-muted-foreground/50" : "text-foreground"}`}>
                          {stageInfo.name}
                        </span>
                        {isParallel && (
                          <span className="text-[10px] px-1.5 py-0 rounded bg-secondary text-secondary-foreground">parallel</span>
                        )}
                      </div>
                      {uiStatus !== "pending" && (
                        <p className="text-xs text-muted-foreground mt-0.5">{stageInfo.subtitle}</p>
                      )}
                    </div>
                  </div>

                  {/* Trade chips for extraction / pricing_labor */}
                  {showTrades && (
                    <div className="flex flex-wrap gap-1.5 ml-11 mb-1.5">
                      {tradeProgress.map((t) => (
                        <span
                          key={t.name}
                          className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
                            t.done
                              ? "bg-success/10 text-success"
                              : "bg-accent/10 text-accent"
                          }`}
                        >
                          {t.done ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          {formatTradeName(t.name)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── Live logs ── */}
        {logs.length > 0 && (
          <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
            <Card className="shadow-card overflow-hidden">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                  <span className="text-sm font-semibold text-foreground">Live Logs ({logs.length})</span>
                  {logsOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
              {!logsOpen && (
                <div className="px-4 pb-3 space-y-1">
                  {logs.slice(0, 2).map((log, i) => (
                    <p key={i} className={`text-xs font-mono ${log.level === "warning" ? "text-warning" : log.level === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                      [{log.level.toUpperCase()}] {log.message}
                    </p>
                  ))}
                </div>
              )}
              <CollapsibleContent>
                <div className="px-4 pb-4 max-h-64 overflow-y-auto space-y-1">
                  {logs.map((log, i) => (
                    <p key={i} className={`text-xs font-mono ${log.level === "warning" ? "text-warning" : log.level === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                      [{log.level.toUpperCase()}] {log.message}
                    </p>
                  ))}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
