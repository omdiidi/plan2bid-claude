import { useState, useRef, useCallback, type ReactNode } from "react";
import { TRADES } from "@/lib/constants";

const TRADE_LABEL_MAP = new Map(TRADES.map(t => [t.value, t.label]));

interface ComboTooltipProps {
  trades: string[];
  children: ReactNode;
  /** Delay in ms before tooltip appears. Default 300 */
  delay?: number;
}

/**
 * Hover tooltip that reveals the trades inside a saved combination.
 * Apple-style: backdrop blur, subtle shadow, smooth scale+opacity entrance.
 */
export default function ComboTooltip({ trades, children, delay = 300 }: ComboTooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      {children}

      {/* Tooltip */}
      <div
        className={`
          absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50
          pointer-events-none select-none
          transition-all duration-150 ease-out
          ${visible
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 translate-y-1 scale-95"
          }
        `}
      >
        <div className="bg-popover/80 backdrop-blur-xl border border-border/60 rounded-xl shadow-xl px-3 py-2.5 min-w-[160px] max-w-[260px]">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            {trades.length} Trade{trades.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap gap-1">
            {trades.map(t => (
              <span
                key={t}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/10 text-accent text-[11px] font-medium whitespace-nowrap"
              >
                {TRADE_LABEL_MAP.get(t) || t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
