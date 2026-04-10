import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ShareModal from "./ShareModal";

interface ShareButtonProps {
  projectId: string;
  projectName?: string;
}

export default function ShareButton({ projectId, projectName }: ShareButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="w-4 h-4 sm:mr-2" />
        <span className="hidden sm:inline">Share</span>
      </Button>
      <ShareModal
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        projectName={projectName}
      />
    </>
  );
}
