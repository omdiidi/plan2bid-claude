import { useRef, useState, useLayoutEffect } from "react";
import { TRADES } from "@/lib/constants";

interface Props {
  tabs: string[];          // ["overview", "electrical", "plumbing", ...]
  activeTab: string;
  onTabChange: (tab: string) => void;
  overviewLabel?: string;  // e.g. "MEP Package" or "All Trades"
}

/** Map trade value → display label using the TRADES constant. */
function tradeLabel(value: string): string {
  if (value === "overview") return "";
  const found = TRADES.find(t => t.value === value);
  return found ? found.label : value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function GCTabBar({ tabs, activeTab, onTabChange, overviewLabel = "All Trades" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const el = tabRefs.current.get(activeTab);
    const container = containerRef.current;
    if (el && container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setIndicator({
        left: elRect.left - containerRect.left + container.scrollLeft,
        width: elRect.width,
      });
    }
  }, [activeTab, tabs]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="flex items-center gap-1 overflow-x-auto no-scrollbar px-1 py-1 bg-muted rounded-lg"
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = tab === activeTab;
          const label = tab === "overview" ? overviewLabel : tradeLabel(tab);
          return (
            <button
              key={tab}
              ref={(el) => { el ? tabRefs.current.set(tab, el) : tabRefs.current.delete(tab); }}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab)}
              className={`
                relative z-10 whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium
                transition-colors duration-200
                ${isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground/80"
                }
              `}
            >
              {label}
            </button>
          );
        })}

        {/* Animated sliding indicator */}
        <div
          className="absolute top-1 h-[calc(100%-0.5rem)] rounded-md bg-background shadow-sm transition-all duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
      </div>
    </div>
  );
}
