import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { acceptShareLink } from "@/lib/api";
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function AcceptShare() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Invalid share link — no token provided.");
      return;
    }

    acceptShareLink(token)
      .then((res) => {
        if (res.status === "accepted") {
          toast.success(`Project shared with you as ${res.permission}`);
          navigate(`/results/${res.project_id}`, { replace: true });
        } else if (res.status === "already_owner") {
          toast.info("You already own this project");
          navigate(`/results/${res.project_id}`, { replace: true });
        } else if (res.status === "already_shared") {
          toast.info(`You already have ${res.permission} access`);
          navigate(`/results/${res.project_id}`, { replace: true });
        }
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(
          err?.status === 404
            ? "This share link is invalid or has been revoked."
            : `Failed to accept share: ${err.message || "Unknown error"}`
        );
      });
  }, [token, navigate]);

  if (status === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent mx-auto" />
          <p className="text-muted-foreground">Accepting share invite...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="p-8 max-w-md text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
        <h2 className="text-xl font-semibold">Share Link Error</h2>
        <p className="text-muted-foreground">{errorMsg}</p>
        <Button onClick={() => navigate("/", { replace: true })}>
          Go to Dashboard
        </Button>
      </Card>
    </div>
  );
}
