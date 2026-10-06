/**
 * Shared CSR proposal review prompt + OpenAI-compatible chat providers (Groq, OpenRouter).
 */

export const CSR_PROPOSAL_REVIEW_PROMPT = `You are an expert AI CSR (Corporate Social Responsibility) Proposal Reviewer.
Analyze the following CSR proposal text against the following standard dimensions:
1. Schedule VII alignment (e.g. CSR mandate areas like education, healthcare, sanitation, environment etc.)
2. Impact metrics and measurable outcomes
3. Budget justification and phase-wise breakdown
4. Geographic coverage and targeting
5. Beneficiary targeting alignment.

First, check if the proposal text is gibberish, too short, or not a real proposal (e.g. single words like "hwy", "test", etc.). If it is, return:
**AI Analysis Complete**

⚠ Warning: The submitted text is too short or invalid to analyze. Please provide a detailed CSR proposal describing the project scope, location, budget, and impact metrics.

Otherwise, analyze the proposal details and return exactly 5 lines of analysis prefixed with checkmarks (✓) or warning symbols (⚠) depending on how well the proposal matches the criteria. Each line must be brief and fit the styling.

Example output format:
**AI Analysis Complete**

✓ Schedule VII alignment: Strong — Education & Skill Development clearly mapped.
⚠ Impact metrics: Consider adding specific KPIs (e.g. number of students, test scores).
✓ Budget justification: Phase-wise breakdown present.
⚠ Geographic targeting: Specify district-level coverage for stronger proposal.
✓ Beneficiary targeting: Well-defined rural youth cohort.

Only output the analysis starting with **AI Analysis Complete** and the checkmarks/warnings. Do not include any other markdown formatting like code blocks, HTML, or extra notes.`;

export function buildReviewUserMessage(proposalText: string) {
  return `${CSR_PROPOSAL_REVIEW_PROMPT}\n\nProposal Text to Analyze:\n${proposalText}`;
}

type ChatMessage = { role: "user" | "system" | "assistant"; content: string };

export async function groqChatCompletion(
  apiKey: string,
  userContent: string,
  model = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
): Promise<string | null> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: userContent }] satisfies ChatMessage[],
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    console.error("Groq API error:", await response.text());
    return null;
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || null;
}

export async function openRouterChatCompletion(
  apiKey: string,
  userContent: string,
  model = "google/gemini-2.5-flash",
): Promise<string | null> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://corpogn.tech",
      "X-Title": "CorpoGN",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: userContent }],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    console.error("OpenRouter API error:", await response.text());
    return null;
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || null;
}
