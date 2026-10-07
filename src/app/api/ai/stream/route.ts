import { getCaller } from "@/lib/access-control";
import {
  buildTaskMessages,
  type AiStreamContext,
  type AiStreamTask,
} from "@/lib/llm-task-prompts";
import {
  llmConfigStatus,
  localFallbackReply,
  pickLlmProvider,
  streamChat,
} from "@/lib/llm-stream";

export const runtime = "nodejs";

type StreamBody = {
  task?: AiStreamTask;
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  context?: AiStreamContext;
  payload?: Record<string, unknown>;
};

function sseLine(data: Record<string, unknown>) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const user = await getCaller(request);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401 });
  }

  let body: StreamBody;
  try {
    body = (await request.json()) as StreamBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), { status: 400 });
  }

  const task = body.task ?? "copilot";
  if (!["copilot", "compliance_summary", "impact_report"].includes(task)) {
    return new Response(JSON.stringify({ error: "Invalid task." }), { status: 400 });
  }

  const context: AiStreamContext = {
    portal: body.context?.portal ?? "ngo",
    section: body.context?.section,
    orgName: body.context?.orgName,
  };

  const messages = buildTaskMessages(
    task,
    context,
    body.payload ?? {},
    body.message,
    body.history,
  );

  const encoder = new TextEncoder();
  const providerHint = pickLlmProvider().id;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseLine(obj)));
      };

      send({ type: "meta", provider: providerHint, task });

      let full = "";

      try {
        const rejectDegenerate = task === "impact_report";
        const result = await streamChat(
          messages,
          (delta) => {
            full += delta;
            send({ type: "delta", text: delta });
          },
          { rejectDegenerate },
        );

        if (!full.trim()) {
          const hint =
            task === "compliance_summary"
              ? "structured compliance metadata only"
              : task === "impact_report"
                ? "impact metrics and project notes"
                : context.section ?? "dashboard";
          const config = llmConfigStatus();
          let offline = localFallbackReply(task.replace("_", " "), hint);
          if (config.hasAnyKey && result.degenerate) {
            offline = `**CorpoGN AI could not produce a clean impact report**

The configured LLM returned repetitive table filler instead of narrative text (often when M&E metrics are empty or the model misbehaves). We tried other providers when keys were available.

**Configured providers:** ${config.providers.join(", ") || "none"}

**What to do:**
- Add or prioritize \`GROQ_API_KEY\` on Render for a reliable fallback.
- Ask partner NGOs to log Monitoring & Evaluation metrics in each signed project workspace.
- Retry after metrics exist or switch \`OPENROUTER_MODEL\` (e.g. \`google/gemini-2.0-flash-001\`).

**Context seen:** ${hint}`;
          } else if (!config.hasAnyKey) {
            send({
              type: "error",
              message:
                "No LLM API keys on the server. Set GROQ_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY in Render.",
            });
          }
          full = offline;
          send({ type: "delta", text: offline });
          send({ type: "done", provider: "local", streamed: false });
        } else {
          send({ type: "done", provider: result.provider, streamed: result.streamed });
        }
      } catch (error) {
        console.error("AI stream error:", error);
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Stream failed.",
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
