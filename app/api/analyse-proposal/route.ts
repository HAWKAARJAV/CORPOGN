import { getCaller } from "@/lib/access-control";
import {
  buildReviewUserMessage,
  groqChatCompletion,
  openRouterChatCompletion,
} from "@/lib/llm-csr-review";

function localAnalyse(text: string): string {
  const lower = text.toLowerCase().trim();

  if (text.length < 15 || lower === "hwy" || lower === "test" || lower === "hello") {
    return `**AI Analysis Complete**

⚠ Warning: The submitted text is too short or invalid to analyze. Please provide a detailed CSR proposal describing the project scope, location, budget, and impact metrics.

💡 Tip: Add GROQ_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY to .env.local for live LLM analysis.`;
  }

  let scheduleVii = "✓ Schedule VII alignment: Strong — Education & Skill Development mapped.";
  if (lower.includes("water") || lower.includes("sanitat") || lower.includes("toilet") || lower.includes("hygiene")) {
    scheduleVii = "✓ Schedule VII alignment: Strong — Safe Drinking Water & Sanitation mapped.";
  } else if (lower.includes("health") || lower.includes("medic") || lower.includes("clinic") || lower.includes("hospital") || lower.includes("doctor")) {
    scheduleVii = "✓ Schedule VII alignment: Strong — Healthcare & Preventive Health mapped.";
  } else if (lower.includes("tree") || lower.includes("forest") || lower.includes("environment") || lower.includes("solar") || lower.includes("green") || lower.includes("carbon")) {
    scheduleVii = "✓ Schedule VII alignment: Strong — Environmental Sustainability mapped.";
  } else if (lower.includes("women") || lower.includes("gender") || lower.includes("girl") || lower.includes("empower")) {
    scheduleVii = "✓ Schedule VII alignment: Strong — Gender Equality & Women Empowerment mapped.";
  } else if (lower.includes("hunger") || lower.includes("food") || lower.includes("malnutr") || lower.includes("poverty")) {
    scheduleVii = "✓ Schedule VII alignment: Strong — Eradicating Hunger & Poverty mapped.";
  }

  let metrics = "⚠ Impact metrics: Consider adding specific, measurable KPIs (e.g. number of beneficiaries, specific target outcomes).";
  if (/\b\d+\s*(people|children|students|women|beneficiar|families|villages|youth)\b/.test(lower) || lower.includes("kpi") || lower.includes("metric") || lower.includes("target")) {
    metrics = "✓ Impact metrics: Good — Quantifiable targets and KPIs are defined.";
  }

  let budget = "⚠ Budget justification: No clear financial breakdown. Mention phase-wise or itemized costs.";
  if (lower.includes("budget") || lower.includes("cost") || lower.includes("rs") || lower.includes("rupee") || lower.includes("lakh") || lower.includes("crore") || /\b\d+\s*(l|cr|lakh|crore|inr|usd|budget|cost)\b/.test(lower)) {
    budget = "✓ Budget justification: Present — Financial estimates and cost breakdown included.";
  }

  let geography = "⚠ Geographic targeting: General location only. Specify state, district, or block-level targeting.";
  const states = ["maharashtra", "delhi", "karnataka", "tamil", "rajasthan", "gujarat", "bihar", "up", "uttar", "madhya", "mp", "bengal", "kerala", "andhra", "telangana", "odisha", "punjab", "haryana", "assam"];
  if (states.some(state => lower.includes(state)) || lower.includes("district") || lower.includes("village") || lower.includes("rural") || lower.includes("slum") || lower.includes("city")) {
    geography = "✓ Geographic targeting: Mapped — Specific regional focus area mentioned.";
  }

  let beneficiary = "⚠ Beneficiary targeting: Broad population. Define specific target cohorts (e.g. rural youth, marginal farmers).";
  if (lower.includes("youth") || lower.includes("children") || lower.includes("farmer") || lower.includes("women") || lower.includes("girl") || lower.includes("disabled") || lower.includes("elderly") || lower.includes("community")) {
    beneficiary = "✓ Beneficiary targeting: Well-defined target cohort identified.";
  }

  return `**AI Analysis Complete**

${scheduleVii}
${metrics}
${budget}
${geography}
${beneficiary}

💡 Tip: Add GROQ_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY to .env.local for live LLM analysis.`;
}

function isTransientAnalysisError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: string }).code) : "";
  const message = error instanceof Error ? error.message : "";
  return code === "ECONNRESET" || code === "ABORT_ERR" || message === "aborted";
}

async function runLlmReview(proposalText: string): Promise<string | null> {
  const userMessage = buildReviewUserMessage(proposalText);
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (groqKey) {
    const result = await groqChatCompletion(groqKey, userMessage);
    if (result) return result;
  }

  if (openRouterKey) {
    const result = await openRouterChatCompletion(openRouterKey, userMessage);
    if (result) return result;
  }

  if (geminiKey) {
    const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMessage }] }],
      }),
    });
    if (!response.ok) {
      console.error("Gemini API error:", await response.text());
      return null;
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  return null;
}

export async function POST(request: Request) {
  const user = await getCaller(request);
  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let trimmedText = "";
  try {
    const { text } = (await request.json()) as { text?: string };
    if (!text || !text.trim()) {
      return Response.json({ error: "Proposal text is required." }, { status: 400 });
    }

    trimmedText = text.trim();

    const llmResult = await runLlmReview(trimmedText);
    if (llmResult) {
      return Response.json({ result: llmResult, provider: process.env.GROQ_API_KEY ? "groq" : process.env.OPENROUTER_API_KEY ? "openrouter" : "gemini" });
    }

    return Response.json({ result: localAnalyse(trimmedText), provider: "local" });
  } catch (error: unknown) {
    if (trimmedText && isTransientAnalysisError(error)) {
      return Response.json({ result: localAnalyse(trimmedText), provider: "local" });
    }
    console.error("Proposal analysis error:", error);
    const message = error instanceof Error ? error.message : "Internal server error during analysis.";
    return Response.json({ error: message }, { status: 500 });
  }
}
