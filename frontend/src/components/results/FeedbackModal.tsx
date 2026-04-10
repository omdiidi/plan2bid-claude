import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TrendingUp, TrendingDown, ThumbsUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { submitFeedback, getProjectFeedback } from "@/lib/api";

interface FeedbackModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Rating = "high" | "low" | "spot_on";

export default function FeedbackModal({ projectId, open, onOpenChange }: FeedbackModalProps) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getProjectFeedback(projectId)
      .then(fb => {
        if (fb) {
          setRating(fb.rating);
          setMessage(fb.message || "");
          setHasExisting(true);
        } else {
          setRating(null);
          setMessage("");
          setHasExisting(false);
        }
      })
      .catch((err: { status?: number }) => {
        if (err?.status === 403) {
          toast.error("You do not have permission to submit feedback for this project.");
          onOpenChange(false);
        }
      })
      .finally(() => setLoading(false));
  }, [open, projectId, onOpenChange]);

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);
    try {
      await submitFeedback(projectId, rating, message.trim() || undefined);
      toast.success("Feedback submitted", { description: "Thank you for helping us improve." });
      onOpenChange(false);
    } catch {
      toast.error("Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  const ratingOptions: { value: Rating; label: string; icon: typeof TrendingUp; activeClass: string; hoverClass: string }[] = [
    { value: "high", label: "Too High", icon: TrendingUp, activeClass: "bg-orange-500 text-white border-orange-500", hoverClass: "hover:border-orange-400 hover:text-orange-500" },
    { value: "spot_on", label: "Spot On", icon: ThumbsUp, activeClass: "bg-emerald-500 text-white border-emerald-500", hoverClass: "hover:border-emerald-400 hover:text-emerald-500" },
    { value: "low", label: "Too Low", icon: TrendingDown, activeClass: "bg-blue-500 text-white border-blue-500", hoverClass: "hover:border-blue-400 hover:text-blue-500" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>How was this estimate?</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Your feedback helps us improve. Tell us what our system did well and what it struggled with.
            </p>

            <div className="grid grid-cols-3 gap-3">
              {ratingOptions.map(opt => {
                const Icon = opt.icon;
                const isActive = rating === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setRating(opt.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                      isActive ? opt.activeClass : `border-border text-muted-foreground ${opt.hoverClass}`
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div>
              <p className="text-[11px] text-muted-foreground mb-2">
                How did our system perform? Were quantities and material specs accurate? Did we miss any line items or get pricing wrong? Your input directly shapes how we improve.
              </p>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="e.g., Material pricing was close but labor hours for drywall were underestimated. The system missed the fire-rated assembly on the east wall..."
                className="min-h-[100px] resize-none text-sm"
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!rating || submitting}
              className="w-full gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {hasExisting ? "Update Feedback" : "Submit Feedback"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
