import Link from "next/link";
import { q1 } from "@/lib/db";
import type { SessionUser } from "@/lib/types";

export async function NextActions({ user }: { user: SessionUser }) {
  const counts = await q1<{ reports: string; repairs: string; overdue: string; checks: string }>(
    `SELECT
      (SELECT count(*) FROM observations WHERE org_id=$1 AND triaged_at IS NULL AND state<>'working') AS reports,
      (SELECT count(*) FROM works WHERE org_id=$1 AND status IN ('planned','in_progress')) AS repairs,
      (SELECT count(*) FROM works WHERE org_id=$1 AND status IN ('planned','in_progress') AND target_date<current_date) AS overdue,
      (SELECT count(*) FROM checks WHERE org_id=$1 AND state IN ('pending','sent') AND due_on<=current_date
         AND ($2::uuid IS NULL OR assigned_to_id=$2)) AS checks`, [user.org_id, user.role === "volunteer" ? user.id : null]
  );
  if (!counts) return null;
  const actions = [
    ...(user.role !== "volunteer" ? [
      { href: "/inbox", count: counts.reports, label: "reports to review", detail: "Turn a reported problem into a repair" },
      { href: "/repairs", count: counts.repairs, label: "open repairs", detail: Number(counts.overdue) ? `${counts.overdue} past their target date` : "Assign owners and update progress" },
    ] : []),
    { href: "/checks", count: counts.checks, label: "checks due", detail: user.role === "volunteer" ? "Your follow-ups due today or earlier" : "Find out whether completed repairs still work" },
  ];
  return <section aria-labelledby="next-actions" className="mb-5 overflow-hidden rounded-[11px] border border-hair bg-surface">
    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-hair-soft px-[18px] py-[14px]">
      <div>
        <h2 id="next-actions" className="text-[14.5px] font-semibold">Move the work forward</h2>
        <p className="mt-0.5 text-[12px] text-mute">The next items that need a decision or update.</p>
      </div>
      <span className="num text-[11px] text-faint">{actions.length} queues</span>
    </div>
    <div className={`grid divide-y divide-hair-soft ${actions.length > 1 ? "lg:grid-cols-3 lg:divide-x lg:divide-y-0" : ""}`}>
      {actions.map((action) => <Link key={action.href} href={action.href} className="group px-[18px] py-4 hover:bg-surface-2">
        <div className="flex items-center gap-2 text-[13px]"><span className="num text-[22px] font-semibold tracking-[-0.02em]">{action.count}</span><span className="font-medium">{action.label}</span><span className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-brand group-hover:bg-brand group-hover:text-white" aria-hidden>→</span></div>
        <p className="mt-1 text-[12px] text-mute">{action.detail}</p>
      </Link>)}
    </div>
  </section>;
}
