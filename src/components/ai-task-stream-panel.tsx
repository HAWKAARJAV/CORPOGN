"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { AiAssistBadge } from "@/components/ai-assist-badge";
import { consumeAiStream } from "@/lib/ai-stream-client";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { AiPortal } from "@/lib/llm-task-prompts";
import type { AiStreamTask } from "@/lib/llm-task-prompts";
import { sanitizeStreamDisplayText } from "@/lib/llm-stream-output";

type AiTaskStreamPanelProps = {
  title: string;
  description: string;
  task: AiStreamTask;
  token?: string;
  portal: AiPortal;
  section: string;
  orgName?: string;
  payload: Record<string, unknown>;
  extraInstructions?: string;
  buttonLabel?: string;
  testId?: string;
  variant?: "light" | "dark";
};

export function AiTaskStreamPanel({
  title,
  description,
  task,
  token,
  portal,
  section,
  orgName,
  payload,
  extraInstructions,
  buttonLabel = "Generate with AI",
  testId = "ai-task-stream-btn",
  variant = "light",
}: AiTaskStreamPanelProps) {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState("");

  const card =
    variant === "dark"
      ? "rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5"
      : "rounded-2xl border border-violet-100 bg-violet-50/40 p-5";

  async function run() {
    let accessToken = token;
    if (!accessToken) {
      const { data } = await supabaseBrowser.auth.getSession();
      accessToken = data.session?.access_token ?? "";
    }
    if (!accessToken) {
      setError("Sign in again to use AI features.");
      return;
    }
    setLoading(true);
    setError("");
    setOutput("");
    setProvider(null);

    try {
      await consumeAiStream({
        task,
        token: accessToken,
        context: { portal, section, orgName },
        message: extraInstructions,
        payload,
        onMeta: (m) => setProvider(m.provider ?? null),
        onDelta: (text) =>
          setOutput((prev) => sanitizeStreamDisplayText(prev + text)),
        onError: (msg) => setError(msg),
        onDone: () => setOutput((prev) => sanitizeStreamDisplayText(prev)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={card} data-testid="ai-task-stream-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
            <p className="text-sm font-bold text-slate-900">{title}</p>
            <AiAssistBadge label="LLM · streaming" variant={variant === "dark" ? "dark" : "emerald"} />
          </div>
          <p className="text-xs text-slate-500 max-w-2xl">{description}</p>
        </div>
        <button
          type="button"
          data-testid={testId}
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? "Streaming…" : buttonLabel}
        </button>
      </div>
      {provider && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600/80 mb-2">
          Provider: {provider}
        </p>
      )}
      {error && <p className="text-xs font-semibold text-red-600 mb-2">{error}</p>}
      {output ? (
        <div
          data-testid="ai-task-stream-output"
          className="mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed"
        >
          {output}
        </div>
      ) : !loading ? (
        <p className="text-xs text-slate-400 italic">Output will stream here when you run generation.</p>
      ) : null}
    </div>
  );
}
