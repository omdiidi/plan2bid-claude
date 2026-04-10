import { useNavigate } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { FilePlus, FolderOpen, TrendingUp, FileText, ArrowRight, Zap, Upload, ClipboardList, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, getStatusColor, formatTypeLabel } from "@/lib/utils";

export default function Dashboard() {
  const { projects } = useApp();
  const navigate = useNavigate();

  const completedProjects = projects.filter(p => p.status === "completed");
  const totalEstimates = completedProjects.reduce((sum, p) => sum + (p.totalEstimate || 0), 0);
  const recentProjects = projects.slice(0, 6);
  const hasProjects = projects.length > 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">AI-powered construction bid estimation</p>
        </div>
        <Button
          onClick={() => navigate("/select-trades")}
          className="gradient-accent text-accent-foreground font-semibold shadow-accent hover:opacity-90 transition-opacity"
          size="lg"
        >
          <FilePlus className="w-5 h-5 mr-2" />
          New Estimate
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="p-5 shadow-card gradient-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Projects</p>
              <p className="text-2xl font-bold text-foreground">{projects.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 shadow-card gradient-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estimates Generated</p>
              <p className="text-2xl font-bold text-foreground">{completedProjects.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 shadow-card gradient-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Estimated Value</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalEstimates)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* How It Works (when no projects) */}
      {!hasProjects && (
        <Card className="p-8 shadow-card border-2 border-dashed border-accent/30">
          <h2 className="text-xl font-bold text-foreground mb-6 text-center">How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {[
              { icon: Upload, title: "1. Upload", desc: "Drop your ZIP file with blueprints — PDFs, TIFFs, images" },
              { icon: ClipboardList, title: "2. Describe", desc: "Fill in project details and let AI validate your description" },
              { icon: BarChart3, title: "3. Get Your Bid", desc: "Receive detailed line items with material & labor costs in minutes" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center">
                <div className="w-14 h-14 rounded-2xl gradient-accent mx-auto mb-3 flex items-center justify-center shadow-accent">
                  <Icon className="w-7 h-7 text-accent-foreground" />
                </div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Projects */}
      {hasProjects && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">Recent Projects</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="text-muted-foreground hover:text-foreground">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentProjects.map(project => (
              <Card
                key={project.id}
                className="p-5 shadow-card hover:shadow-card-hover transition-shadow cursor-pointer group"
                onClick={() => navigate(project.status === "running" || project.status === "queued" || project.status === "error" ? `/progress/${project.id}` : `/results/${project.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-1">{project.name}</h3>
                  <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">{project.city}, {project.state}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs">{project.trade}</Badge>
                  <Badge variant="secondary" className="text-xs">{formatTypeLabel(project.facilityType)}</Badge>
                  {project.projectType && <Badge variant="secondary" className="text-xs">{formatTypeLabel(project.projectType)}</Badge>}
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">{formatDate(project.createdAt)}</span>
                  {project.totalEstimate ? (
                    <span className="text-sm font-bold text-foreground">{formatCurrency(project.totalEstimate)}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
