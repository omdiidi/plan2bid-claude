import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Search, X, FolderOpen, ChevronLeft, ChevronRight, FileText, Download, Loader2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubDocuments, getSubPageImageUrl, getSubPdfUrl } from "@/lib/api";
import type { ProjectDocument } from "@/types";

type DocTypeBadge = { bg: string; text: string };
const DOC_TYPE_STYLES: Record<string, DocTypeBadge> = {
  "Construction Plans": { bg: "bg-accent/10", text: "text-accent" },
  "Handbook": { bg: "bg-secondary", text: "text-secondary-foreground" },
  "As-Built Drawings": { bg: "bg-success/10", text: "text-success" },
  "Floor Plan": { bg: "bg-primary/10", text: "text-primary" },
};

function DocTypeBadgeChip({ type }: { type: string }) {
  const style = DOC_TYPE_STYLES[type] ?? { bg: "bg-secondary", text: "text-secondary-foreground" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
      {type}
    </span>
  );
}

interface Props {
  token: string;
}

export default function SubDocumentViewer({ token }: Props) {
  const isMobile = useIsMobile();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [selectedDocIndex, setSelectedDocIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setDocsLoading(true);
    getSubDocuments(token)
      .then(res => {
        setDocuments(res.documents);
        if (res.documents.length > 0) setSelectedDocIndex(res.documents[0].doc_index);
      })
      .catch(() => { setDocuments([]); })
      .finally(() => setDocsLoading(false));
  }, [token]);

  const selectedDoc = documents.find(d => d.doc_index === selectedDocIndex) ?? documents[0];

  const selectDoc = (docIndex: number, page?: number) => {
    setSelectedDocIndex(docIndex);
    const doc = documents.find(d => d.doc_index === docIndex);
    const target = page ?? 1;
    setCurrentPage(doc && target > doc.total_pages ? doc.total_pages : target);
    setMobileSheetOpen(false);
  };

  const handleDownloadPdf = async (docIndex: number) => {
    try {
      const res = await getSubPdfUrl(token, docIndex);
      window.open(res.url, "_blank");
    } catch {
      toast.error("Failed to open PDF");
    }
  };

  const prevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const nextPage = () => {
    if (selectedDoc) setCurrentPage((p) => Math.min(selectedDoc.total_pages, p + 1));
  };

  if (docsLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading documents...</span>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <FileText className="w-8 h-8 mb-2" />
        <p className="text-sm">No documents available.</p>
      </div>
    );
  }

  const pageImageUrl = getSubPageImageUrl(token, selectedDocIndex, currentPage);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-0.5">
          {documents.map((doc) => (
            <div key={doc.doc_index} className="flex items-center gap-1">
              <button
                onClick={() => selectDoc(doc.doc_index)}
                className={`flex-1 text-left p-2.5 rounded-lg transition-colors ${
                  doc.doc_index === selectedDocIndex
                    ? "bg-accent/10 border border-accent/20"
                    : "hover:bg-muted/60"
                }`}
              >
                <p className="text-xs font-medium text-foreground truncate">{doc.filename}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] text-muted-foreground">{doc.total_pages} pages</span>
                  {doc.document_type && <DocTypeBadgeChip type={doc.document_type} />}
                </div>
              </button>
              {doc.file_type === "pdf" && (
                <button
                  onClick={() => handleDownloadPdf(doc.doc_index)}
                  className="p-1.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                  title="Open PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const viewerArea = selectedDoc ? (
    <div className="flex flex-col h-full min-h-[500px]">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{selectedDoc.filename}</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-muted/20">
        <div
          className="bg-background border border-border rounded-sm shadow-sm overflow-hidden flex items-center justify-center cursor-pointer relative group"
          style={{ width: "100%", maxWidth: 520, aspectRatio: "8.5 / 11" }}
          onClick={() => setFullscreen(true)}
        >
          <img
            src={pageImageUrl}
            alt={`Page ${currentPage} of ${selectedDoc.filename}`}
            className="w-full h-full object-contain"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
            <Maximize2 className="w-6 h-6 text-foreground/0 group-hover:text-foreground/40 transition-colors" />
          </div>
        </div>
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] w-auto p-2">
          <DialogTitle className="sr-only">{selectedDoc.filename} — Page {currentPage}</DialogTitle>
          <div className="flex flex-col items-center gap-2">
            <div className="overflow-auto max-h-[78vh] flex items-center justify-center">
              <img
                src={pageImageUrl}
                alt={`Page ${currentPage} of ${selectedDoc.filename}`}
                className="max-w-full max-h-[78vh] object-contain"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); prevPage(); }} disabled={currentPage <= 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground font-medium min-w-[100px] text-center">
                Page {currentPage} of {selectedDoc.total_pages}
              </span>
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); nextPage(); }} disabled={currentPage >= selectedDoc.total_pages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-border">
        <Button variant="outline" size="sm" onClick={prevPage} disabled={currentPage <= 1}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-muted-foreground font-medium min-w-[100px] text-center">
          Page {currentPage} of {selectedDoc.total_pages}
        </span>
        <Button variant="outline" size="sm" onClick={nextPage} disabled={currentPage >= selectedDoc.total_pages}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  ) : null;

  if (isMobile) {
    return (
      <div className="relative">
        {viewerArea}
        <button
          onClick={() => setMobileSheetOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center hover:bg-accent/90 transition-colors"
        >
          <FolderOpen className="w-5 h-5" />
        </button>
        <Drawer open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
          <DrawerContent className="max-h-[70vh]">
            <DrawerHeader>
              <DrawerTitle>Documents</DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 overflow-hidden">{sidebarContent}</div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  return (
    <div className="flex border-t border-border" style={{ minHeight: 560 }}>
      <div className="w-[300px] shrink-0 border-r border-border">{sidebarContent}</div>
      <div className="flex-1">{viewerArea}</div>
    </div>
  );
}
