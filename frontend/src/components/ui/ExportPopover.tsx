import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, FileText, FileSpreadsheet, Info } from "lucide-react";

interface ExportPopoverProps {
  onExport: (format: "xlsx" | "pdf" | "industry-xlsx") => void;
  showIndustry?: boolean;
}

export default function ExportPopover({ onExport, showIndustry = true }: ExportPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = (format: "xlsx" | "pdf" | "industry-xlsx") => {
    setOpen(false);
    onExport(format);
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" onClick={() => setOpen(o => !o)} className="gap-1.5">
        <Download className="w-4 h-4" />
        Export
      </Button>
      {open && (
        <div className="absolute top-full mt-2 right-0 z-50 min-w-[240px] rounded-lg border border-border bg-background shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-1.5 space-y-0.5">
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground rounded-md hover:bg-muted/60 transition-colors text-left"
              onClick={() => select("pdf")}
            >
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1">PDF</span>
            </button>
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground rounded-md hover:bg-muted/60 transition-colors text-left"
              onClick={() => select("xlsx")}
            >
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1">Plan2Bid Excel</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="p-1 text-muted-foreground hover:text-foreground transition-colors" onClick={e => e.stopPropagation()}>
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[220px] text-xs">
                  Materials and labor split into separate tables per trade. Great for internal review.
                </TooltipContent>
              </Tooltip>
            </button>
            {showIndustry && (
              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground rounded-md hover:bg-muted/60 transition-colors text-left"
                onClick={() => select("industry-xlsx")}
              >
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1">Industry Standard Excel</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="p-1 text-muted-foreground hover:text-foreground transition-colors" onClick={e => e.stopPropagation()}>
                      <Info className="w-3.5 h-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[220px] text-xs">
                    Combined materials and labor on each line item with CSI divisions. Standard format for bids and submittals.
                  </TooltipContent>
                </Tooltip>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
