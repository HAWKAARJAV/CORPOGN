import type { ChatMessage } from "@/lib/llm-stream";

export type AiPortal = "ngo" | "corporate" | "admin";

export type AiStreamTask = "copilot" | "compliance_summary" | "impact_report";

export type AiStreamContext = {
  portal: AiPortal;
  section?: string;
  orgName?: string;
};

const COPILOT_SYSTEM = `You are CorpoGN Copilot — an expert assistant for Indian CSR, NGO compliance, and corporate–NGO partnerships on the CorpoGN platform.
Be concise, actionable, and accurate. Use markdown sparingly (bold for headings, bullet lists).
Never invent legal registration numbers or financial figures not present in the context.
If data is missing, say what to upload or collect next.
Audience: CSR managers, NGO admins, and platform operators.`;

const COMPLIANCE_SYSTEM = `You are a compliance analyst for Indian NGOs and CSR partnerships.
Summarize the compliance posture from structured metadata only (document types on file, resolved registration fields, gaps).
Output sections:
## Executive summary (2–3 sentences)
## Documents on file
## Gaps & risks (bullet list, prioritize statutory items: 12A, 80G, CSR-1, registration, FCRA if applicable)
## Recommended next actions (numbered, max 5)
Do not claim you read PDF contents unless an excerpt was provided.`;

const IMPACT_SYSTEM = `You are an impact reporting writer for CSR and ESG disclosures in India.
Draft a board-ready impact narrative from the metrics and notes provided.
Output sections:
## Project snapshot
## Outcomes & KPIs
## Beneficiary & geography narrative
## ESG / SDG alignment
## Risks, limitations & data quality
## Suggested disclosures for annual CSR report
Use professional tone; mark estimates clearly if inputs are thin.`;

export function buildTaskMessages(
  task: AiStreamTask,
  context: AiStreamContext,
  payload: Record<string, unknown>,
  userMessage?: string,
  history?: { role: "user" | "assistant"; content: string }[],
): ChatMessage[] {
  const contextBlock = [
    `Portal: ${context.portal}`,
    context.section ? `Current section: ${context.section}` : null,
    context.orgName ? `Organization: ${context.orgName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (task === "copilot") {
    const messages: ChatMessage[] = [
      { role: "system", content: `${COPILOT_SYSTEM}\n\n${contextBlock}` },
    ];
    for (const turn of history ?? []) {
      messages.push({ role: turn.role, content: turn.content.slice(0, 8000) });
    }
    messages.push({
      role: "user",
      content: (userMessage ?? "").trim().slice(0, 12000) || "What should I focus on in this dashboard?",
    });
    return messages;
  }

  if (task === "compliance_summary") {
    const body = JSON.stringify(payload, null, 2).slice(0, 20000);
    return [
      { role: "system", content: `${COMPLIANCE_SYSTEM}\n\n${contextBlock}` },
      {
        role: "user",
        content: `Summarize this compliance vault snapshot:\n\n${body}`,
      },
    ];
  }

  const body = JSON.stringify(payload, null, 2).slice(0, 20000);
  return [
    { role: "system", content: `${IMPACT_SYSTEM}\n\n${contextBlock}` },
    {
      role: "user",
      content: `Draft an impact report from this data:\n\n${body}${
        userMessage ? `\n\nAdditional instructions:\n${userMessage.slice(0, 4000)}` : ""
      }`,
    },
  ];
}
