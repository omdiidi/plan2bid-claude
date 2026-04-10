import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { deleteProjectsBulk } from "@/lib/api";
import { Search, Trash2, FolderOpen, Users, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, formatDate, getStatusColor, formatTypeLabel } from "@/lib/utils";

export default function Projects() {
  const { projects, deleteProject, refreshProjects } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const filtered = projects
    .filter(p => {
      const q = search.toLowerCase();
      return !q || p.name.toLowerCase().includes(q) || p.city.toLowerCase().includes(q) || p.trade.toLowerCase().includes(q) || p.facilityType.toLowerCase().includes(q) || (p.projectType || "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "oldest": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "estimate-high": return (b.totalEstimate || 0) - (a.totalEstimate || 0);
        case "estimate-low": return (a.totalEstimate || 0) - (b.totalEstimate || 0);
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  // Only owner projects can be selected for deletion
  const ownedFiltered = filtered.filter(p => !p.role || p.role === "owner");

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === ownedFiltered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ownedFiltered.map(p => p.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      await deleteProjectsBulk(Array.from(selected));
      refreshProjects();
      setSelected(new Set());
      setSelectMode(false);
    } catch {
      // Still refresh to sync state
      refreshProjects();
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-foreground">Projects</h1>
        {!selectMode ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => setSelectMode(true)}
          >
            <CheckSquare className="w-4 h-4" />
            Select Projects
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSelectAll}
              className="text-sm"
            >
              {selected.size === ownedFiltered.length ? "Deselect All" : "Select All"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              disabled={selected.size === 0}
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selected.size})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exitSelectMode}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Search & Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="estimate-high">Highest Estimate</SelectItem>
            <SelectItem value="estimate-low">Lowest Estimate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Project Cards */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No projects found</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(project => {
            const isOwner = !project.role || project.role === "owner";
            const isSelected = selected.has(project.id);

            return (
              <Card
                key={project.id}
                className={`p-5 shadow-card hover:shadow-card-hover transition-all cursor-pointer group relative ${
                  isSelected ? "ring-2 ring-destructive/50 bg-destructive/5" : ""
                }`}
                onClick={() => {
                  if (selectMode) {
                    if (isOwner) toggleSelect(project.id);
                    return;
                  }
                  navigate(project.status === "running" || project.status === "queued" ? `/progress/${project.id}` : `/results/${project.id}`);
                }}
              >
                {/* Select checkbox */}
                {selectMode && isOwner && (
                  <div className="absolute top-3 left-3 z-10">
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-destructive border-destructive text-white"
                          : "border-muted-foreground/40 bg-background"
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>
                )}

                <div className={`${selectMode && isOwner ? "pl-7" : ""}`}>
                  {/* Header: name + status */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-1 pr-2">{project.name}</h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {project.role && project.role !== "owner" && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Users className="w-3 h-3" />
                          {project.role}
                        </Badge>
                      )}
                      <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {project.address ? `${project.address}, ` : ""}{project.city}, {project.state}
                  </p>
                  {project.sharedBy && (
                    <p className="text-xs text-muted-foreground mt-0.5">Shared by {project.sharedBy}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{project.trade}</Badge>
                    <Badge variant="secondary" className="text-xs">{formatTypeLabel(project.facilityType)}</Badge>
                    {project.projectType && <Badge variant="secondary" className="text-xs">{formatTypeLabel(project.projectType)}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">{project.documentCount} docs · {project.pageCount} pages</div>

                  {/* Footer: date, estimate, delete button */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">{formatDate(project.createdAt)}</span>
                    <div className="flex items-center gap-3">
                      {!selectMode && isOwner && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={e => { e.stopPropagation(); setDeleteId(project.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="text-xs">Delete</span>
                        </Button>
                      )}
                      {project.totalEstimate ? (
                        <span className="text-sm font-bold text-foreground">{formatCurrency(project.totalEstimate)}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Single Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>This will remove the project and all output files. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteId) { deleteProject(deleteId); setDeleteId(null); } }}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loading screen preview */}
      <div className="flex justify-center pt-4">
        <button
          onClick={() => navigate("/progress/preview")}
          className="text-xs text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors select-none px-3 py-1"
        >
          ···
        </button>
      </div>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={() => setBulkDeleteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} Project{selected.size !== 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              This will permanently remove {selected.size} project{selected.size !== 1 ? "s" : ""} and all associated data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? "Deleting..." : `Delete ${selected.size} Project${selected.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
