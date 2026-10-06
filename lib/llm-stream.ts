/**
 * OpenAI-compatible chat completions (Groq, OpenRouter) with optional streaming.
 */

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export type LlmProviderId = "groq" | "openrouter" | "gemini" | "local";

function groqModel() {
  return process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";
}

function openRouterModel() {
  return process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
}

function geminiModel() {
  return process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
}

export function pickLlmProvider(): { id: LlmProviderId; apiKey?: string } {
  if (process.env.GROQ_API_KEY) return { id: "groq", apiKey: process.env.GROQ_API_KEY };
  if (process.env.OPENROUTER_API_KEY) return { id: "openrouter", apiKey: process.env.OPENROUTER_API_KEY };
  if (process.env.GEMINI_API_KEY) return { id: "gemini", apiKey: process.env.GEMINI_API_KEY };
  return { id: "local" };
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
      max_tokens: 2500,
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
  const first = pickLlmProvider();
  if (first.id === "groq" && first.apiKey) {
    const text = await openAiCompatibleComplete(
      "https://api.groq.com/openai/v1/chat/completions",
      first.apiKey,
      groqModel(),
      messages,
    );
    if (text) return { text, provider: "groq" };
  }
  if (process.env.OPENROUTER_API_KEY) {
    const text = await openAiCompatibleComplete(
      "https://openrouter.ai/api/v1/chat/completions",
      process.env.OPENROUTER_API_KEY,
      openRouterModel(),
      messages,
      {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://corpogn.tech",
        "X-Title": "CorpoGN",
      },
    );
    if (text) return { text, provider: "openrouter" };
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
    if (text) return { text, provider: "gemini" };
  }
  return null;
}

type StreamChunkHandler = (delta: string) => void;

async function streamOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onDelta: StreamChunkHandler,
  extraHeaders?: Record<string, string>,
): Promise<boolean> {
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
      max_tokens: 2500,
      temperature: 0.35,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    console.error("LLM stream error:", await response.text());
    return false;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch {
        // ignore partial JSON
      }
    }
  }

  return true;
}

/** Stream tokens; falls back to one-shot complete for Gemini / missing stream support. */
export async function streamChat(
  messages: ChatMessage[],
  onDelta: StreamChunkHandler,
): Promise<{ provider: LlmProviderId; streamed: boolean }> {
  if (process.env.GROQ_API_KEY) {
    const ok = await streamOpenAiCompatible(
      "https://api.groq.com/openai/v1/chat/completions",
      process.env.GROQ_API_KEY,
      groqModel(),
      messages,
      onDelta,
    );
    if (ok) return { provider: "groq", streamed: true };
  }

  if (process.env.OPENROUTER_API_KEY) {
    const ok = await streamOpenAiCompatible(
      "https://openrouter.ai/api/v1/chat/completions",
      process.env.OPENROUTER_API_KEY,
      openRouterModel(),
      messages,
      onDelta,
      {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://corpogn.tech",
        "X-Title": "CorpoGN",
      },
    );
    if (ok) return { provider: "openrouter", streamed: true };
  }

  const fallback = await completeChat(messages);
  if (fallback) {
    onDelta(fallback.text);
    return { provider: fallback.provider, streamed: false };
  }

  return { provider: "local", streamed: false };
}

export function localFallbackReply(task: string, contextHint: string): string {
  return `**CorpoGN AI (offline mode)**

No LLM API key is configured on the server. Add \`GROQ_API_KEY\`, \`OPENROUTER_API_KEY\`, or \`GEMINI_API_KEY\` to \`.env.local\` for live ${task}.

**What we can still see in your request:** ${contextHint}

**Suggested next steps:**
- Upload or paste compliance excerpts for a richer summary once the LLM is connected.
- Use the checklist above to close document gaps before investor due diligence.`;
}
