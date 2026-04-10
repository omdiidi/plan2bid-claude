import { useState, useEffect, useRef } from "react";
import {
  MessageSquare, X, Send, Search, User, Bot, Loader2,
  FileText, ExternalLink, Mic, Square, CheckCircle2,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sendChatMessage, getDocuments, transcribeVoice } from "@/lib/api";
import type { ChatMessage, ChatReference, ProjectDocument } from "@/types";
import type { Json } from "@/integrations/supabase/types";
import PageViewerLightbox from "./PageViewerLightbox";

// ── Helpers ────────────────────────────────────────────
const now = () =>
  new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

async function saveChatMessage(
  userId: string,
  projectId: string,
  role: "user" | "assistant",
  content: string,
  metadata?: Record<string, unknown>,
) {
  await supabase.from("chat_messages").insert({
    user_id: userId,
    project_id: projectId,
    role,
    content,
    metadata: (metadata || {}) as Json,
  });
}

// ── Component ──────────────────────────────────────────
interface DocumentChatProps {
  projectIdOverride?: string;
  onRequireAuth?: () => void;
}

export default function DocumentChat({ projectIdOverride, onRequireAuth }: DocumentChatProps = {}) {
  const { projectId: routeProjectId } = useParams();
  const projectId = projectIdOverride ?? routeProjectId;
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [deepSearch, setDeepSearch] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing" | "done">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [pageViewer, setPageViewer] = useState<{
    open: boolean;
    docName: string;
    docIndex: number;
    page: number;
    totalPages: number;
  }>({ open: false, docName: "", docIndex: 0, page: 1, totalPages: 1 });

  const bottomRef = useRef<HTMLDivElement>(null);

  // Load document metadata for page viewer
  useEffect(() => {
    if (!projectId) return;
    getDocuments(projectId)
      .then(res => setDocuments(res.documents))
      .catch(() => {});
  }, [projectId]);

  // Load chat history from Supabase on first open
  useEffect(() => {
    if (!isOpen || historyLoaded || !user || !projectId) return;
    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(50);

      if (data && data.length > 0) {
        setMessages(
          data.map((row) => {
            const meta = (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata))
              ? (row.metadata as Record<string, unknown>)
              : {};
            return {
              id: `db-${row.id}`,
              role: row.role as "user" | "assistant",
              content: row.content,
              references: Array.isArray(meta.references) ? (meta.references as ChatReference[]) : undefined,
              tier_used: typeof meta.tier_used === "number" ? meta.tier_used : undefined,
              model_used: typeof meta.model_used === "string" ? meta.model_used : undefined,
              mode: (meta.mode === "auto" || meta.mode === "deep_search") ? meta.mode : undefined,
              confidence: typeof meta.confidence === "string" ? meta.confidence : undefined,
              intent: typeof meta.intent === "string" ? meta.intent : undefined,
              reasoning_summary: typeof meta.reasoning_summary === "string" ? meta.reasoning_summary : undefined,
              timestamp: new Date(row.created_at).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            };
          }),
        );
      }
      setHistoryLoaded(true);
    })();
  }, [isOpen, historyLoaded, user, projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading || !user || !projectId) return;

    const userMsg: ChatMessage = {
      id: `user-${crypto.randomUUID()}`,
      role: "user",
      content: trimmed,
      timestamp: now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    // Persist user message
    saveChatMessage(user.id, projectId, "user", trimmed);

    try {
      // Build history from existing messages (last 20 for context)
      const history = messages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await sendChatMessage(
        projectId,
        trimmed,
        history,
        deepSearch ? "deep_search" : "auto",
      );

      const assistantMsg: ChatMessage = {
        id: `assistant-${crypto.randomUUID()}`,
        role: "assistant",
        content: response.answer,
        references: response.references,
        tier_used: response.tier_used,
        model_used: response.model_used,
        mode: deepSearch ? "deep_search" : "auto",
        confidence: response.confidence,
        intent: response.intent,
        reasoning_summary: response.reasoning_summary,
        timestamp: now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Persist assistant message
      saveChatMessage(user.id, projectId, "assistant", response.answer, {
        references: response.references,
        tier_used: response.tier_used,
        model_used: response.model_used,
        mode: assistantMsg.mode,
        confidence: response.confidence,
        intent: response.intent,
        reasoning_summary: response.reasoning_summary,
      });
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `error-${crypto.randomUUID()}`,
        role: "assistant",
        content: `Sorry, I encountered an error: ${(err as Error).message}`,
        timestamp: now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoice = async () => {
    if (voiceState === "idle") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          setVoiceState("processing");
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          try {
            const result = await transcribeVoice(audioBlob);
            if (result.text) {
              setInputValue(prev => prev ? `${prev} ${result.text}` : result.text);
            }
            setVoiceState("done");
            setTimeout(() => setVoiceState("idle"), 1500);
          } catch {
            setVoiceState("idle");
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setVoiceState("recording");
      } catch {
        // Microphone access denied
      }
    } else if (voiceState === "recording") {
      mediaRecorderRef.current?.stop();
    }
  };

  const openPageViewer = (ref: { doc_name: string; page_number: number; doc_index?: number }) => {
    const doc = documents.find(d => d.filename === ref.doc_name || d.doc_index === ref.doc_index);
    const docIndex = ref.doc_index ?? doc?.doc_index ?? 0;
    const totalPages = doc?.total_pages ?? 1;
    setPageViewer({ open: true, docName: ref.doc_name, docIndex, page: ref.page_number, totalPages });
  };

  // ── FAB ────────────────────────────────────────────
  if (!isOpen) {
    return (
      <button
        onClick={() => {
          if (!user && onRequireAuth) {
            onRequireAuth();
            return;
          }
          setIsOpen(true);
        }}
        className="fixed bottom-6 right-6 z-50 w-[67px] h-[67px] lg:w-[84px] lg:h-[84px] rounded-full bg-accent text-accent-foreground shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-105 animate-scale-in"
      >
        <MessageSquare className="w-[27px] h-[27px] lg:w-[34px] lg:h-[34px]" />
      </button>
    );
  }

  // ── Panel ──────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] md:w-[440px] lg:w-[480px] bg-background border-l border-border flex flex-col animate-slide-in-right shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-foreground">Document Assistant</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDeepSearch((d) => !d)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                deepSearch
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <Search className="w-3 h-3" />
              Deep Search
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Ask me about your documents</p>
              <p className="text-xs text-muted-foreground/60">Costs, labor hours, document pages, scope details...</p>
            </div>
          ) : (
            messages.map((msg) =>
              msg.role === "user" ? (
                <UserBubble key={msg.id} msg={msg} />
              ) : (
                <AssistantBubble key={msg.id} msg={msg} onRefClick={openPageViewer} />
              ),
            )
          )}

          {isLoading && (
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
              </div>
              <div className="bg-secondary rounded-xl rounded-tl px-3 py-2 text-sm text-muted-foreground">
                {deepSearch ? (
                  "Searching documents..."
                ) : (
                  <span className="flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
                  </span>
                )}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={deepSearch ? "Deep search your documents..." : "Ask about your documents..."}
              disabled={isLoading}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50"
            />
            <button
              onClick={handleVoice}
              disabled={voiceState === "processing" || isLoading}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 ${
                voiceState === "recording"
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {voiceState === "recording" ? (
                <Square className="w-3 h-3" />
              ) : voiceState === "processing" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : voiceState === "done" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="w-7 h-7 rounded-lg bg-accent text-accent-foreground flex items-center justify-center disabled:opacity-30 transition-opacity hover:opacity-90"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <PageViewerLightbox
        open={pageViewer.open}
        projectId={projectId!}
        docIndex={pageViewer.docIndex}
        docName={pageViewer.docName}
        currentPage={pageViewer.page}
        totalPages={pageViewer.totalPages}
        onClose={() => setPageViewer((p) => ({ ...p, open: false }))}
        onPageChange={(page) => setPageViewer((p) => ({ ...p, page }))}
      />
    </>
  );
}

// ── Sub-components ─────────────────────────────────────
function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex items-start gap-2 justify-end">
      <div className="flex flex-col items-end max-w-[80%]">
        <div className="bg-accent text-accent-foreground px-3 py-2 rounded-xl rounded-tr text-sm whitespace-pre-wrap">
          {msg.content}
        </div>
        <span className="text-[10px] text-muted-foreground mt-1">{msg.timestamp}</span>
      </div>
      <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
        <User className="w-3.5 h-3.5 text-accent" />
      </div>
    </div>
  );
}

interface AssistantRef {
  doc_index?: number;
  doc_name: string;
  page_number: number;
  description: string;
}

function AssistantBubble({
  msg,
  onRefClick,
}: {
  msg: ChatMessage;
  onRefClick: (ref: AssistantRef) => void;
}) {
  const refs = msg.references?.map((r) => ({
    doc_index: r.doc_index,
    doc_name: r.doc_name,
    page_number: r.page_number,
    description: r.description,
  })) ?? [];

  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
        <Bot className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex flex-col max-w-[85%]">
        {(msg.model_used || msg.mode) && (
          <span className="text-[10px] font-mono text-muted-foreground/60 mb-0.5">
            {msg.mode === "deep_search" ? "Deep Search" : "Chat Agent"}
          </span>
        )}
        <div className="bg-secondary px-3 py-2 rounded-xl rounded-tl text-sm text-foreground whitespace-pre-wrap">
          {msg.content}
        </div>

        {refs.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {refs.map((ref, i) => (
              <button
                key={i}
                onClick={() => onRefClick(ref)}
                className="group w-full flex items-center gap-2.5 border border-border rounded-lg px-3 py-2 text-left hover:border-accent/40 hover:bg-accent/5 transition-colors"
              >
                <div className="w-8 h-8 rounded bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {ref.doc_name} — p.{ref.page_number}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">{ref.description}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        <span className="text-[10px] text-muted-foreground mt-1">{msg.timestamp}</span>
      </div>
    </div>
  );
}
