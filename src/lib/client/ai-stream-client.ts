import type { AiPortal } from "@/lib/llm-task-prompts";
import type { AiStreamTask } from "@/lib/llm-task-prompts";

export type AiStreamOptions = {
  task: AiStreamTask;
  token: string;
  context: {
    portal: AiPortal;
    section?: string;
    orgName?: string;
  };
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  payload?: Record<string, unknown>;
  onMeta?: (meta: { provider?: string; task?: string }) => void;
  onDelta: (text: string) => void;
  onDone?: (info: { provider?: string; streamed?: boolean }) => void;
  onError?: (message: string) => void;
  onReset?: () => void;
};

export async function consumeAiStream(opts: AiStreamOptions): Promise<void> {
  const res = await fetch("/api/ai/stream", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      task: opts.task,
      message: opts.message,
      history: opts.history,
      context: opts.context,
      payload: opts.payload,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    opts.onError?.((err as { error?: string }).error ?? `HTTP ${res.status}`);
    return;
  }

  if (!res.body) {
    opts.onError?.("No response body.");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        const json = JSON.parse(line.slice(5).trim()) as {
          type: string;
          text?: string;
          message?: string;
          provider?: string;
          task?: string;
          streamed?: boolean;
        };
        if (json.type === "meta") opts.onMeta?.({ provider: json.provider, task: json.task });
        if (json.type === "reset") {
          opts.onReset?.();
          continue;
        }
        if (json.type === "delta" && json.text) opts.onDelta(json.text);
        if (json.type === "done") opts.onDone?.({ provider: json.provider, streamed: json.streamed });
        if (json.type === "error") opts.onError?.(json.message ?? "Stream error");
      } catch {
        // ignore
      }
    }
  }
}
