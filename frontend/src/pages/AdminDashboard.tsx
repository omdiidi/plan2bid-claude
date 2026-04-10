import { useEffect, useState } from "react";
import { useRole } from "@/hooks/useRole";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, Shield, Loader2, BarChart3, UserPlus, FolderOpen, MessageSquare, TrendingUp, TrendingDown, ThumbsUp, KeyRound, Copy, Check, ExternalLink, Trash2, Plus } from "lucide-react";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";
import { adminGetUsers, adminGetProjects, adminGetFeedback, adminGetTokens, adminCreateToken, adminRevokeToken, adminDeleteUser } from "@/lib/api";
import type { BackendProject, ProjectFeedback } from "@/types";
import type { SignupToken } from "@/lib/api";

interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  company_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  role: string;
  runs_total: number;
  runs_today: number;
}

export default function AdminDashboard() {
  const { isAdmin, loading: roleLoading } = useRole();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allProjects, setAllProjects] = useState<BackendProject[]>([]);
  const [feedback, setFeedback] = useState<ProjectFeedback[]>([]);
  const [tokens, setTokens] = useState<SignupToken[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [tokensLoading, setTokensLoading] = useState(true);

  // Token creation state
  const [tokenLabel, setTokenLabel] = useState("");
  const [creatingToken, setCreatingToken] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;

    setUsersLoading(true);
    adminGetUsers()
      .then(data => setUsers(data as AdminUser[]))
      .catch(() => { setUsers([]); toast.error("Failed to load users"); })
      .finally(() => setUsersLoading(false));

    setProjectsLoading(true);
    adminGetProjects()
      .then(data => setAllProjects(data))
      .catch(() => { setAllProjects([]); toast.error("Failed to load projects"); })
      .finally(() => setProjectsLoading(false));

    setFeedbackLoading(true);
    adminGetFeedback()
      .then(data => setFeedback(data))
      .catch(() => setFeedback([]))
      .finally(() => setFeedbackLoading(false));

    setTokensLoading(true);
    adminGetTokens()
      .then(data => setTokens(data))
      .catch(() => setTokens([]))
      .finally(() => setTokensLoading(false));
  }, [isAdmin]);

  const handleCreateToken = async () => {
    setCreatingToken(true);
    setNewToken(null);
    try {
      const created = await adminCreateToken(tokenLabel || undefined);
      setTokens(prev => [created, ...prev]);
      setNewToken(created.token);
      setTokenLabel("");
    } catch {
      toast.error("Failed to create token");
    } finally {
      setCreatingToken(false);
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevokeToken = async (tokenId: string) => {
    try {
      await adminRevokeToken(tokenId);
      setTokens(prev => prev.map(t => t.id === tokenId ? { ...t, is_active: false } : t));
      toast.success("Token revoked");
    } catch {
      toast.error("Failed to revoke token");
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}? This will permanently remove all their data.`)) return;
    try {
      await adminDeleteUser(userId);
      setUsers(prev => prev.filter(u => u.user_id !== userId));
      toast.success("User deleted");
    } catch {
      toast.error("Failed to delete user");
    }
  };

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  const spotOnCount = feedback.filter(f => f.rating === "spot_on").length;
  const highCount = feedback.filter(f => f.rating === "high").length;
  const lowCount = feedback.filter(f => f.rating === "low").length;

  const newUsersLast7Days = users.filter(u => {
    const created = new Date(u.created_at);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return created >= sevenDaysAgo;
  }).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg gradient-accent flex items-center justify-center shadow-accent">
          <Shield className="w-5 h-5 text-accent-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage users and monitor activity</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-3xl font-bold text-foreground">
                {usersLoading ? "—" : users.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">New (last 7 days)</p>
              <p className="text-3xl font-bold text-foreground">
                {usersLoading ? "—" : newUsersLast7Days}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
              <FolderOpen className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Projects</p>
              <p className="text-3xl font-bold text-foreground">
                {projectsLoading ? "—" : allProjects.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Feedback</p>
              <p className="text-3xl font-bold text-foreground">
                {feedbackLoading ? "—" : feedback.length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="w-3.5 h-3.5" />Users
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />All Projects
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />Feedback
          </TabsTrigger>
          <TabsTrigger value="tokens" className="gap-1.5">
            <KeyRound className="w-3.5 h-3.5" />Signup Tokens
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                All Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 font-medium">User</th>
                        <th className="pb-3 font-medium">Company</th>
                        <th className="pb-3 font-medium">Role</th>
                        <th className="pb-3 font-medium">Joined</th>
                        <th className="pb-3 font-medium">Last Sign In</th>
                        <th className="pb-3 font-medium text-right">Total Runs</th>
                        <th className="pb-3 font-medium text-right">Today</th>
                        <th className="pb-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {users.map((u) => (
                        <tr key={u.id} className="group">
                          <td className="py-3">
                            <p className="font-medium text-foreground">{u.display_name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {u.company_name || "—"}
                          </td>
                          <td className="py-3">
                            <Badge
                              variant={u.role === "admin" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {u.role}
                            </Badge>
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {u.last_sign_in_at
                              ? new Date(u.last_sign_in_at).toLocaleDateString()
                              : "Never"}
                          </td>
                          <td className="py-3 text-right font-mono text-foreground">
                            {u.runs_total ?? 0}
                          </td>
                          <td className="py-3 text-right font-mono text-foreground">
                            {u.runs_today ?? 0}
                          </td>
                          <td className="py-3">
                            {u.role !== "admin" && (
                              <button
                                onClick={() => handleDeleteUser(u.user_id, u.email)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-destructive"
                                title="Delete user"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Projects Tab */}
        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5" />
                All User Projects
              </CardTitle>
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                </div>
              ) : allProjects.length === 0 ? (
                <p className="text-center text-muted-foreground py-10">No projects yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 font-medium">Project</th>
                        <th className="pb-3 font-medium">Trade</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium text-right">Estimate</th>
                        <th className="pb-3 font-medium">Created</th>
                        <th className="pb-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {allProjects.map((p) => (
                        <tr key={p.id} className="group">
                          <td className="py-3">
                            <p className="font-medium text-foreground truncate max-w-[250px]">{p.project_address}</p>
                            <p className="text-xs text-muted-foreground">{p.facility_type} · {p.project_type}</p>
                          </td>
                          <td className="py-3">
                            <Badge variant="secondary" className="text-xs">{p.trade}</Badge>
                          </td>
                          <td className="py-3">
                            <Badge className={getStatusColor(p.status)}>{p.status}</Badge>
                          </td>
                          <td className="py-3 text-right font-mono text-foreground">
                            {p.total_estimate ? formatCurrency(p.total_estimate) : "—"}
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {formatDate(p.created_at)}
                          </td>
                          <td className="py-3">
                            {p.status === "completed" && (
                              <button
                                onClick={() => navigate(`/estimate/${p.id}/results`)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent/10 text-accent"
                                title="View estimate"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feedback Tab */}
        <TabsContent value="feedback">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Estimate Feedback
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Tally Cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <ThumbsUp className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{spotOnCount}</p>
                    <p className="text-xs text-muted-foreground">Spot On</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <TrendingUp className="w-5 h-5 text-orange-500" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{highCount}</p>
                    <p className="text-xs text-muted-foreground">Too High</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <TrendingDown className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{lowCount}</p>
                    <p className="text-xs text-muted-foreground">Too Low</p>
                  </div>
                </div>
              </div>

              {/* Feedback Messages */}
              {feedbackLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                </div>
              ) : feedback.length === 0 ? (
                <p className="text-center text-muted-foreground py-10">No feedback submitted yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 font-medium">Project</th>
                        <th className="pb-3 font-medium">Rating</th>
                        <th className="pb-3 font-medium">Message</th>
                        <th className="pb-3 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {feedback.map((fb) => (
                        <tr key={fb.id}>
                          <td className="py-3">
                            <p className="font-medium text-foreground truncate max-w-[200px]">
                              {fb.projects?.project_address || fb.project_id}
                            </p>
                            {fb.projects && (
                              <p className="text-xs text-muted-foreground">
                                {fb.projects.trade} · {fb.projects.facility_type}
                              </p>
                            )}
                          </td>
                          <td className="py-3">
                            <Badge className={`text-xs ${
                              fb.rating === "spot_on"
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : fb.rating === "high"
                                ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
                                : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                            }`}>
                              {fb.rating === "spot_on" ? "Spot On" : fb.rating === "high" ? "Too High" : "Too Low"}
                            </Badge>
                          </td>
                          <td className="py-3 text-muted-foreground max-w-[300px]">
                            <p className="truncate">{fb.message || "—"}</p>
                          </td>
                          <td className="py-3 text-muted-foreground whitespace-nowrap">
                            {formatDate(fb.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* Signup Tokens Tab */}
        <TabsContent value="tokens">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5" />
                  Signup Tokens
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Create token form */}
              <div className="flex items-end gap-3 p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Label (optional)</label>
                  <Input
                    placeholder="e.g. John Doe from Acme Co."
                    value={tokenLabel}
                    onChange={(e) => setTokenLabel(e.target.value)}
                    className="h-9"
                  />
                </div>
                <Button onClick={handleCreateToken} disabled={creatingToken} className="gap-1.5 h-9">
                  {creatingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Token
                </Button>
              </div>

              {/* Newly generated token display */}
              {newToken && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <KeyRound className="w-4 h-4 text-emerald-600 shrink-0" />
                  <code className="flex-1 font-mono text-lg font-bold tracking-widest text-emerald-700">{newToken}</code>
                  <button
                    onClick={() => handleCopyToken(newToken)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}

              {/* Tokens table */}
              {tokensLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                </div>
              ) : tokens.length === 0 ? (
                <p className="text-center text-muted-foreground py-10">No tokens created yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 font-medium">Token</th>
                        <th className="pb-3 font-medium">Label</th>
                        <th className="pb-3 font-medium">Created</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {tokens.map((t) => {
                        const isExpired = t.expires_at && new Date(t.expires_at) < new Date();
                        const status = !t.is_active
                          ? { label: "Revoked", cls: "bg-muted text-muted-foreground" }
                          : t.used_by
                          ? { label: "Used", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" }
                          : isExpired
                          ? { label: "Expired", cls: "bg-orange-500/10 text-orange-600 border-orange-500/20" }
                          : { label: "Active", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };
                        return (
                          <tr key={t.id} className="group">
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <code className="font-mono text-sm font-semibold text-foreground tracking-wider">{t.token}</code>
                                <button
                                  onClick={() => handleCopyToken(t.token)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                                  title="Copy token"
                                >
                                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                              </div>
                            </td>
                            <td className="py-3 text-muted-foreground">{t.label || "—"}</td>
                            <td className="py-3 text-muted-foreground whitespace-nowrap">{formatDate(t.created_at)}</td>
                            <td className="py-3">
                              <Badge className={`text-xs ${status.cls}`}>{status.label}</Badge>
                              {t.used_at && (
                                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(t.used_at)}</p>
                              )}
                            </td>
                            <td className="py-3">
                              {t.is_active && !t.used_by && (
                                <button
                                  onClick={() => handleRevokeToken(t.id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-destructive"
                                  title="Revoke token"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
