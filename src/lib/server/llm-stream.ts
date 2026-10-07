/**
 * OpenAI-compatible chat completions (Groq, OpenRouter) with optional streaming.
 */

import {
  chunkTextForStream,
  isDegenerateLlmOutput,
} from "@/lib/llm-stream-output";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export type LlmProviderId = "groq" | "openrouter" | "gemini" | "local";

export type StreamChatOptions = {
  /** When true, skip provider output that looks like table-separator loops and try the next key. */
  rejectDegenerate?: boolean;
};

type StreamProvider = {
  id: Exclude<LlmProviderId, "local">;
  url: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
};

function groqModel() {
  return process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
}

function openRouterModel() {
  return process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001";
}

function geminiModel() {
  return process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
}

function streamMaxTokens() {
  const raw = process.env.LLM_STREAM_MAX_TOKENS;
  const n = raw ? Number(raw) : 1800;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 4096) : 1800;
}

export function pickLlmProvider(): { id: LlmProviderId; apiKey?: string } {
  if (process.env.GROQ_API_KEY) return { id: "groq", apiKey: process.env.GROQ_API_KEY };
  if (process.env.OPENROUTER_API_KEY) return { id: "openrouter", apiKey: process.env.OPENROUTER_API_KEY };
  if (process.env.GEMINI_API_KEY) return { id: "gemini", apiKey: process.env.GEMINI_API_KEY };
  return { id: "local" };
}

function streamProviderChain(): StreamProvider[] {
  const chain: StreamProvider[] = [];
  if (process.env.GROQ_API_KEY) {
    chain.push({
      id: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: process.env.GROQ_API_KEY,
      model: groqModel(),
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    chain.push({
      id: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: openRouterModel(),
      extraHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://corpogn.tech",
        "X-Title": "CorpoGN",
      },
    });
  }
  return chain;
}

function extractStreamDelta(json: {
  choices?: { delta?: { content?: string | null; text?: string | null } }[];
}): string {
  const delta = json.choices?.[0]?.delta;
  const piece = delta?.content ?? delta?.text ?? "";
  return typeof piece === "string" ? piece : "";
}

async function openAiCompatibleComplete(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  extraHeaders?: Record<string, string>,
): Promise<string | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: streamMaxTokens(),
      temperature: 0.35,
    }),
  });

  if (!response.ok) {
    console.error("LLM complete error:", await response.text());
    return null;
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || null;
}

export async function completeChat(messages: ChatMessage[]): Promise<{ text: string; provider: LlmProviderId } | null> {
  for (const p of streamProviderChain()) {
    const text = await openAiCompatibleComplete(p.url, p.apiKey, p.model, messages, p.extraHeaders);
    if (text && !isDegenerateLlmOutput(text)) return { text, provider: p.id };
    if (text) console.warn(`LLM complete degenerate output from ${p.id}, trying next provider`);
  }

  if (process.env.GEMINI_API_KEY) {
    const combined = messages
      .map((m) => `${m.role === "system" ? "System" : m.role === "user" ? "User" : "Assistant"}:\n${m.content}`)
      .join("\n\n");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: combined }] }] }),
    });
    if (!response.ok) {
      console.error("Gemini complete error:", await response.text());
      return null;
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text && !isDegenerateLlmOutput(text)) return { text, provider: "gemini" };
  }
  return null;
}

type StreamChunkHandler = (delta: string) => void;

async function streamOpenAiCompatibleCollect(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  extraHeaders?: Record<string, string>,
): Promise<{ ok: boolean; text: string; errorBody?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: streamMaxTokens(),
      temperature: 0.35,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.text();
    console.error("LLM stream error:", errorBody);
    return { ok: false, text: "", errorBody };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string | null; text?: string | null } }[];
        };
        const delta = extractStreamDelta(json);
        if (delta) {
          text += delta;
          if (isDegenerateLlmOutput(text)) {
            await reader.cancel().catch(() => undefined);
            return { ok: false, text, errorBody: "degenerate_output" };
          }
        }
      } catch {
        // ignore partial JSON
      }
    }
  }

  return { ok: true, text };
}

function emitPseudoStream(text: string, onDelta: StreamChunkHandler) {
  for (const chunk of chunkTextForStream(text)) {
    onDelta(chunk);
  }
}

/** Stream tokens; falls back through providers on errors or degenerate table filler. */
export async function streamChat(
  messages: ChatMessage[],
  onDelta: StreamChunkHandler,
  options?: StreamChatOptions,
): Promise<{ provider: LlmProviderId; streamed: boolean; degenerate?: boolean; errorHint?: string }> {
  const rejectDegenerate = options?.rejectDegenerate ?? true;
  const chain = streamProviderChain();

  if (chain.length === 0) {
    return { provider: "local", streamed: false, errorHint: "no_api_keys" };
  }

  let lastError: string | undefined;

  for (const p of chain) {
    const { ok, text, errorBody } = await streamOpenAiCompatibleCollect(
      p.url,
      p.apiKey,
      p.model,
      messages,
      p.extraHeaders,
    );

    if (!ok && errorBody && errorBody !== "degenerate_output") {
      lastError = errorBody.slice(0, 200);
    }

    if (!text.trim()) continue;

    if (rejectDegenerate && isDegenerateLlmOutput(text)) {
      console.warn(`LLM stream degenerate output from ${p.id}, trying next provider`);
      lastError = "degenerate_output";
      continue;
    }

    if (!ok && errorBody === "degenerate_output") {
      lastError = "degenerate_output";
      continue;
    }

    emitPseudoStream(text, onDelta);
    return { provider: p.id, streamed: true };
  }

  const fallback = await completeChat(messages);
  if (fallback) {
    emitPseudoStream(fallback.text, onDelta);
    return { provider: fallback.provider, streamed: false };
  }

  return {
    provider: "local",
    streamed: false,
    degenerate: lastError === "degenerate_output",
    errorHint: lastError,
  };
}

export function localFallbackReply(task: string, contextHint: string): string {
  return `**CorpoGN AI (offline mode)**

No LLM API key is configured on the server, or all providers returned unusable output. Set \`GROQ_API_KEY\` (recommended), \`OPENROUTER_API_KEY\`, or \`GEMINI_API_KEY\` in your Render environment variables for live ${task}.

**What we can still see in your request:** ${contextHint}

**Suggested next steps:**
- Ensure partner NGOs have logged Monitoring & Evaluation metrics in the project workspace.
- Upload or paste compliance excerpts for a richer summary once the LLM is connected.
- Use the checklist above to close document gaps before investor due diligence.`;
}

export function llmConfigStatus(): {
  hasAnyKey: boolean;
  providers: LlmProviderId[];
} {
  const providers: LlmProviderId[] = [];
  if (process.env.GROQ_API_KEY) providers.push("groq");
  if (process.env.OPENROUTER_API_KEY) providers.push("openrouter");
  if (process.env.GEMINI_API_KEY) providers.push("gemini");
  return { hasAnyKey: providers.length > 0, providers };
}
