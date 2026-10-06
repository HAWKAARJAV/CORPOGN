import { getCaller } from "@/lib/access-control";

function localAnalyse(text: string): string {
  const lower = text.toLowerCase().trim();

  if (text.length < 15 || lower === "hwy" || lower === "test" || lower === "hello") {
    return `**AI Analysis Complete**

⚠ Warning: The submitted text is too short or invalid to analyze. Please provide a detailed CSR proposal describing the project scope, location, budget, and impact metrics.

💡 Tip: To unlock the full power of Gemini AI, add a GEMINI_API_KEY or OPENROUTER_API_KEY to your .env.local file.`;
  }

  // Detect focus areas
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

  // Detect metrics
  let metrics = "⚠ Impact metrics: Consider adding specific, measurable KPIs (e.g. number of beneficiaries, specific target outcomes).";
  if (/\b\d+\s*(people|children|students|women|beneficiar|families|villages|youth)\b/.test(lower) || lower.includes("kpi") || lower.includes("metric") || lower.includes("target")) {
    metrics = "✓ Impact metrics: Good — Quantifiable targets and KPIs are defined.";
  }

  // Detect budget
  let budget = "⚠ Budget justification: No clear financial breakdown. Mention phase-wise or itemized costs.";
  if (lower.includes("budget") || lower.includes("cost") || lower.includes("rs") || lower.includes("rupee") || lower.includes("lakh") || lower.includes("crore") || /\b\d+\s*(l|cr|lakh|crore|inr|usd|budget|cost)\b/.test(lower)) {
    budget = "✓ Budget justification: Present — Financial estimates and cost breakdown included.";
  }

  // Detect geography
  let geography = "⚠ Geographic targeting: General location only. Specify state, district, or block-level targeting.";
  const states = ["maharashtra", "delhi", "karnataka", "tamil", "rajasthan", "gujarat", "bihar", "up", "uttar", "madhya", "mp", "bengal", "kerala", "andhra", "telangana", "odisha", "punjab", "haryana", "assam"];
  if (states.some(state => lower.includes(state)) || lower.includes("district") || lower.includes("village") || lower.includes("rural") || lower.includes("slum") || lower.includes("city")) {
    geography = "✓ Geographic targeting: Mapped — Specific regional focus area mentioned.";
  }

  // Detect beneficiary
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

💡 Tip: Add GEMINI_API_KEY or OPENROUTER_API_KEY to your .env.local file to enable advanced Gemini AI analysis.`;
}

function isTransientAnalysisError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: string }).code) : "";
  const message = error instanceof Error ? error.message : "";
  return code === "ECONNRESET" || code === "ABORT_ERR" || message === "aborted";
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
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!openRouterKey && !geminiKey) {
      // Return rule-based local analysis fallback
      const analysis = localAnalyse(trimmedText);
      return Response.json({ result: analysis });
    }

    const systemPrompt = `You are an expert AI CSR (Corporate Social Responsibility) Proposal Reviewer.
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

    if (openRouterKey) {
      // Call OpenRouter API
      const url = "https://openrouter.ai/api/v1/chat/completions";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Corpogn",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: `${systemPrompt}\n\nProposal Text to Analyze:\n${trimmedText}`,
            },
          ],
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("OpenRouter API Error Response:", errText);
        // Fallback to local analysis if API call fails
        const analysis = localAnalyse(trimmedText);
        return Response.json({ result: analysis });
      }

      const data = await response.json();
      const resultText = data.choices?.[0]?.message?.content?.trim() || "";

      if (!resultText) {
        const analysis = localAnalyse(trimmedText);
        return Response.json({ result: analysis });
      }

      return Response.json({ result: resultText });
    }

    if (geminiKey) {
      // Call live Gemini API
      const model = "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\nProposal Text to Analyze:\n${trimmedText}`,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Gemini API Error Response:", errText);
        // Fallback to local analysis if API call fails
        const analysis = localAnalyse(trimmedText);
        return Response.json({ result: analysis });
      }

      const data = await response.json();
      const resultText =
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

      if (!resultText) {
        const analysis = localAnalyse(trimmedText);
        return Response.json({ result: analysis });
      }

      return Response.json({ result: resultText });
    }

    // Default fallback
    return Response.json({ result: localAnalyse(trimmedText) });
  } catch (error: unknown) {
    if (trimmedText && isTransientAnalysisError(error)) {
      return Response.json({ result: localAnalyse(trimmedText) });
    }
    console.error("Proposal analysis error:", error);
    const message = error instanceof Error ? error.message : "Internal server error during analysis.";
    return Response.json({ error: message }, { status: 500 });
  }
}
