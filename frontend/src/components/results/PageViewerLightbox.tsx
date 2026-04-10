import { useEffect, useCallback, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { getPageImageUrl, getAuthHeaders } from "@/lib/api";

// ── Authenticated image loading (same pattern as DocumentViewer) ──

function useAuthImage(url: string): { src: string | null; loading: boolean } {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setSrc(null);
    getAuthHeaders().then(headers =>
      fetch(url, { headers })
    ).then(res => {
      if (!res.ok) throw new Error(`${res.status}`);
      return res.blob();
    }).then(blob => {
      if (revoked) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => {
      if (!revoked) setSrc(null);
    }).finally(() => {
      if (!revoked) setLoading(false);
    });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return { src, loading };
}

function AuthImage({ url, alt, className, style }: { url: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const { src, loading } = useAuthImage(url);
  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full" style={style}>
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }
  if (!src) {
    return (
      <div className="flex items-center justify-center w-full h-full text-center px-4" style={style}>
        <p className="text-sm text-white/40">Page could not be loaded</p>
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} style={style} />;
}

function Thumbnail({ url, active, onClick }: { url: string; active: boolean; onClick: () => void }) {
  const { src, loading } = useAuthImage(url);
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 w-[60px] h-[80px] rounded-sm overflow-hidden transition-all ${
        active
          ? "ring-2 ring-accent bg-white/15"
          : "bg-white/5 hover:bg-white/10"
      }`}
    >
      {loading ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-3 h-3 animate-spin text-white/30" />
        </div>
      ) : src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-white/30">?</div>
      )}
    </button>
  );
}

// ── Component ──

interface PageViewerLightboxProps {
  open: boolean;
  projectId: string;
  docIndex: number;
  docName: string;
  currentPage: number;
  totalPages: number;
  onClose: () => void;
  onPageChange: (page: number) => void;
}

export default function PageViewerLightbox({
  open,
  projectId,
  docIndex,
  docName,
  currentPage,
  totalPages,
  onClose,
  onPageChange,
}: PageViewerLightboxProps) {
  const [zoom, setZoom] = useState(100);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentPage > 1) onPageChange(currentPage - 1);
      if (e.key === "ArrowRight" && currentPage < totalPages) onPageChange(currentPage + 1);
    },
    [open, currentPage, totalPages, onClose, onPageChange]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) setZoom(100);
  }, [open, currentPage]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(300, Math.max(25, z + (e.deltaY > 0 ? -10 : 10))));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-black/50 backdrop-blur-sm">
        <div className="flex items-center gap-3 text-white/90 text-sm">
          <span className="font-medium truncate max-w-[120px] sm:max-w-[200px]">{docName}</span>
          <span className="text-white/50">Page {currentPage}</span>
          <span className="text-white/40">{currentPage} of {totalPages}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-1">
            <button onClick={() => setZoom((z) => Math.max(25, z - 25))} className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-white/60 font-mono w-12 text-center">{zoom}%</span>
            <button onClick={() => setZoom((z) => Math.min(300, z + 25))} className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => setZoom(100)} className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-white bg-white/20 hover:bg-white/30 transition-colors ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Viewport */}
      <div className="relative z-10 flex-1 flex items-center justify-center overflow-hidden" onWheel={handleWheel}>
        {/* Nav arrows */}
        {currentPage > 1 && (
          <button
            onClick={() => onPageChange(currentPage - 1)}
            className="absolute left-4 z-10 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {currentPage < totalPages && (
          <button
            onClick={() => onPageChange(currentPage + 1)}
            className="absolute right-4 z-10 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Actual page image */}
        <AuthImage
          url={getPageImageUrl(projectId, docIndex, currentPage)}
          alt={`Page ${currentPage}`}
          className="object-contain transition-transform max-w-[calc(100vw-2rem)] max-h-[calc(100vh-10rem)] sm:max-w-none sm:max-h-none"
          style={{
            width: `${340 * (zoom / 100)}px`,
            height: `${440 * (zoom / 100)}px`,
          }}
        />
      </div>

      {/* Thumbnail strip */}
      {totalPages > 1 && (
        <div className="relative z-10 flex items-center gap-2 px-4 py-3 bg-black/50 backdrop-blur-sm overflow-x-auto">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Thumbnail
              key={p}
              url={getPageImageUrl(projectId, docIndex, p)}
              active={p === currentPage}
              onClick={() => onPageChange(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
