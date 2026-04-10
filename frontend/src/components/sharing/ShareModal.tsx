import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createEmailShare,
  createLinkShare,
  listShares,
  updateShare,
  revokeShare,
} from "@/lib/api";
import type { ProjectShare, SharePermission } from "@/types";
import {
  Copy,
  Link2,
  Loader2,
  Mail,
  Trash2,
  UserPlus,
  Check,
  Crown,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string;
}

export default function ShareModal({
  open,
  onOpenChange,
  projectId,
  projectName,
}: ShareModalProps) {
  const [shares, setShares] = useState<ProjectShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [emailPerm, setEmailPerm] = useState<SharePermission>("viewer");
  const [linkPerm, setLinkPerm] = useState<SharePermission>("viewer");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listShares(projectId);
      setShares(data);
    } catch {
      // Might fail if user isn't owner — just show empty
      setShares([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      fetchShares();
      setGeneratedLink("");
      setCopied(false);
    }
  }, [open, fetchShares]);

  const handleEmailInvite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    try {
      const res = await createEmailShare(projectId, email.trim(), emailPerm);
      toast.success(
        res.status === "active"
          ? `Shared with ${email} as ${emailPerm}`
          : `Invite sent to ${email} (pending signup)`
      );
      setEmail("");
      fetchShares();
    } catch (err: any) {
      const msg =
        err?.status === 409
          ? "This email has already been invited"
          : err?.status === 400
            ? err.details || "Invalid request"
            : "Failed to send invite";
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleGenerateLink = async () => {
    setGeneratingLink(true);
    try {
      const res = await createLinkShare(projectId, linkPerm);
      const url = `${window.location.origin}/share/${res.token}`;
      setGeneratedLink(url);
      fetchShares();
    } catch {
      toast.error("Failed to generate share link");
    } finally {
      setGeneratingLink(false);
    }
  };

  // Auto-reset copied state after 2s (with cleanup)
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast.success("Link copied to clipboard");
  };

  const handlePermissionChange = async (
    shareId: number,
    newPerm: SharePermission
  ) => {
    try {
      await updateShare(projectId, shareId, newPerm);
      fetchShares();
      toast.success("Permission updated");
    } catch {
      toast.error("Failed to update permission");
    }
  };

  const handleRevoke = async (shareId: number, name: string) => {
    try {
      await revokeShare(projectId, shareId);
      fetchShares();
      toast.success(`Removed ${name}'s access`);
    } catch {
      toast.error("Failed to revoke access");
    }
  };

  // Filter out link-template shares (no user, no email — just token holders)
  const userShares = shares.filter(
    (s) => s.user_id || s.email
  );
  const linkShares = shares.filter(
    (s) => s.share_type === "link" && s.share_token && !s.user_id && !s.email
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Share {projectName ? `"${projectName}"` : "Project"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Email Invite */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              Invite by email
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailInvite()}
                className="flex-1"
              />
              <Select
                value={emailPerm}
                onValueChange={(v) => setEmailPerm(v as SharePermission)}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleEmailInvite}
                disabled={!email.trim() || inviting}
              >
                {inviting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Link Share */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              Share via link
            </label>
            <div className="flex gap-2">
              <Select
                value={linkPerm}
                onValueChange={(v) => setLinkPerm(v as SharePermission)}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleGenerateLink}
                disabled={generatingLink}
                className="flex-1"
              >
                {generatingLink ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                Generate Link
              </Button>
            </div>
            {generatedLink && (
              <div className="flex gap-2 mt-2">
                <Input
                  value={generatedLink}
                  readOnly
                  className="text-xs font-mono"
                />
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Anyone with this link must sign in to access the project.
            </p>
          </div>

          {/* People with access */}
          {(userShares.length > 0 || linkShares.length > 0) && (
            <>
              <Separator />
              <div className="space-y-2">
                <label className="text-sm font-medium">People with access</label>
                {loading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {userShares.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-2 py-1.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                            {s.display_name?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm truncate">
                              {s.display_name}
                            </p>
                            {!s.accepted_at && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" /> pending
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Select
                            value={s.permission}
                            onValueChange={(v) =>
                              handlePermissionChange(s.id, v as SharePermission)
                            }
                          >
                            <SelectTrigger className="h-7 w-[85px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              handleRevoke(s.id, s.display_name)
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {linkShares.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-2 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm">
                              Share link{" "}
                              <Badge variant="secondary" className="text-xs ml-1">
                                {s.permission}
                              </Badge>
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRevoke(s.id, "link")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
