import { Sparkles } from "lucide-react";

type AiAssistBadgeProps = {
  label?: string;
  className?: string;
  variant?: "light" | "dark" | "emerald";
};

export function AiAssistBadge({
  label = "AI-assisted",
  className = "",
  variant = "light",
}: AiAssistBadgeProps) {
  const styles =
    variant === "dark"
      ? "border-violet-400/30 bg-violet-500/10 text-violet-200"
      : variant === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-violet-200 bg-violet-50 text-violet-800";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles} ${className}`}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

export function AiInsightLine({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-violet-700/90 ${className}`}>
      <Sparkles className="mr-1 inline h-3 w-3 text-violet-500" aria-hidden />
      {text}
    </p>
  );
}
