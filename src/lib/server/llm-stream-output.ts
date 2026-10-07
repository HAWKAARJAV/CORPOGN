/** Detect repetitive markdown table filler (|---| rows, pipe-only lines). */

const SEPARATOR_LINE =
  /^\s*\|?[\s\-:|]+\|?\s*$|^\s*\|\s*Metric\s*\|\s*Value\s*\|/i;

export function isDegenerateLlmOutput(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 80) return false;

  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 4) return false;

  let separatorLines = 0;
  let pipeHeavyLines = 0;
  const lineCounts = new Map<string, number>();

  for (const line of lines) {
    const t = line.trim();
    lineCounts.set(t, (lineCounts.get(t) ?? 0) + 1);
    if (SEPARATOR_LINE.test(t)) separatorLines += 1;
    const nonPipe = t.replace(/[\|\s\-:]/g, "");
    if (t.includes("|") && nonPipe.length < 4) pipeHeavyLines += 1;
  }

  const maxRepeat = Math.max(...lineCounts.values(), 0);
  if (maxRepeat >= 6 && (lines[0]?.includes("|") ?? false)) return true;
  if (separatorLines >= 5) return true;
  if (pipeHeavyLines / lines.length > 0.45) return true;

  const nonWs = trimmed.replace(/\s/g, "");
  if (nonWs.length > 200) {
    const dashPipe = (nonWs.match(/[\|\-]/g) ?? []).length / nonWs.length;
    if (dashPipe > 0.55) return true;
  }

  return false;
}

/** Collapse runs of markdown table separator / empty pipe rows (client safety net). */
export function sanitizeStreamDisplayText(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let separatorRun = 0;

  for (const line of lines) {
    const t = line.trim();
    const isSep = SEPARATOR_LINE.test(t) || /^\|\s*[-—]+\s*\|/.test(t);
    if (isSep) {
      separatorRun += 1;
      if (separatorRun <= 1) out.push(line);
      continue;
    }
    separatorRun = 0;
    out.push(line);
  }

  return out.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd();
}

export function chunkTextForStream(text: string, size = 96): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}
