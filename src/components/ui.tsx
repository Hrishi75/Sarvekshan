import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <div
      className={`rounded-[9px] border border-hair bg-surface ${pad ? "p-[17px]" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

const TONES = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  brand: "bg-brand-soft text-brand",
  plain: "bg-surface-2 text-body border border-hair",
} as const;

export type Tone = keyof typeof TONES;

export function Tag({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-[4px] px-[7px] py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "secondary",
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const style =
    variant === "primary"
      ? "bg-brand text-white font-semibold"
      : "border border-hair bg-surface text-body font-medium";
  return (
    <span
      className={`inline-flex h-[33px] items-center gap-[6px] rounded-[7px] px-[13px] text-[13px] ${style} ${className}`}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[9px] border border-dashed border-hair px-4 py-12 text-center text-[13px] text-mute">
      {children}
    </div>
  );
}

/** Score tone thresholds are used in several places — keep them in one spot. */
export function scoreTone(score: number | null): Tone {
  if (score == null) return "plain";
  if (score >= 70) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

export function scoreColor(score: number | null): string {
  if (score == null) return "text-faint";
  if (score >= 70) return "text-good";
  if (score >= 50) return "text-warn";
  return "text-bad";
}

export function scoreBg(score: number | null): string {
  if (score == null) return "bg-hair";
  if (score >= 70) return "bg-good";
  if (score >= 50) return "bg-warn";
  return "bg-bad";
}

export { rupees, relativeDays } from "@/lib/format";
