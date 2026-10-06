"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Sparkles, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { consumeAiStream } from "@/lib/ai-stream-client";
import type { AiPortal } from "@/lib/llm-task-prompts";

type CopilotMessage = { role: "user" | "assistant"; content: string };

type DashboardCopilotProps = {
  portal: AiPortal;
  orgName?: string;
  /** Active nav section / page label for context */
  section: string;
  theme?: "light" | "dark";
};

export function DashboardCopilot({ portal, orgName, section, theme = "light" }: DashboardCopilotProps) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? "");
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, draft]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (!token) {
      setError("Session expired — refresh and sign in again.");
      return;
    }

    setError("");
    setInput("");
    const userMsg: CopilotMessage = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setStreaming(true);
    setDraft("");

    let assistant = "";
    try {
      await consumeAiStream({
        task: "copilot",
        token,
        context: { portal, section, orgName },
        message: text,
        history: messages,
        onDelta: (chunk) => {
          assistant += chunk;
          setDraft(assistant);
        },
        onError: (msg) => setError(msg),
      });
      if (assistant.trim()) {
        setMessages((prev) => [...prev, { role: "assistant", content: assistant }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copilot failed.");
    } finally {
      setDraft("");
      setStreaming(false);
    }
  }, [input, streaming, token, portal, section, orgName, messages]);

  const isDark = theme === "dark";
  const fab =
    isDark
      ? "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/40"
      : "bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200";
  const panel =
    isDark
      ? "border-white/10 bg-[#0f0f18] text-white"
      : "border-slate-200 bg-white text-slate-900";

  return (
    <>
      <button
        type="button"
        data-testid="copilot-fab"
        onClick={() => setOpen((o) => !o)}
        className={`fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full transition ${fab}`}
        aria-label={open ? "Close CorpoGN Copilot" : "Open CorpoGN Copilot"}
      >
        {open ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>

      {open && (
        <div
          data-testid="copilot-panel"
          className={`fixed bottom-24 right-5 z-[60] flex w-[min(100vw-2rem,24rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl ${panel}`}
          style={{ height: "min(70vh, 32rem)" }}
        >
          <div
            className={`flex items-center gap-2 border-b px-4 py-3 ${
              isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-violet-50"
            }`}
          >
            <Sparkles className="h-4 w-4 text-violet-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">CorpoGN Copilot</p>
              <p className={`text-[10px] truncate ${isDark ? "text-white/40" : "text-slate-500"}`}>
                {section} · streaming LLM
              </p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && !draft && (
              <p className={`text-xs px-1 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                Ask about compliance gaps, impact reporting, CSR workflows, or what to do next on this page.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? isDark
                      ? "ml-6 bg-violet-600/30 text-white"
                      : "ml-6 bg-violet-100 text-violet-950"
                    : isDark
                      ? "mr-4 bg-white/5 text-white/90"
                      : "mr-4 bg-slate-50 text-slate-800"
                }`}
              >
                {m.content}
              </div>
            ))}
            {draft && (
              <div
                className={`mr-4 rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                  isDark ? "bg-white/5 text-white/90" : "bg-slate-50 text-slate-800"
                }`}
              >
                {draft}
              </div>
            )}
            {error && <p className="text-xs font-semibold text-red-500 px-1">{error}</p>}
          </div>

          <div className={`border-t p-3 ${isDark ? "border-white/10" : "border-slate-100"}`}>
            <div className="flex gap-2">
              <input
                data-testid="copilot-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={streaming}
                placeholder="Ask CorpoGN…"
                className={`flex-1 rounded-xl border px-3 py-2 text-sm outline-none ${
                  isDark
                    ? "border-white/10 bg-black/30 text-white placeholder:text-white/30"
                    : "border-slate-200 bg-white text-slate-900"
                }`}
              />
              <button
                type="button"
                data-testid="copilot-send"
                onClick={send}
                disabled={streaming || !input.trim()}
                className="rounded-xl bg-violet-600 p-2.5 text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
