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
  return <section aria-labelledby="next-actions" className="mb-5 rounded-[9px] border border-hair bg-surface">
    <h2 id="next-actions" className="border-b border-hair-soft px-4 py-3 text-[14px] font-semibold">Move the work forward</h2>
    <div className={`grid divide-y divide-hair-soft ${actions.length > 1 ? "lg:grid-cols-3 lg:divide-x lg:divide-y-0" : ""}`}>
      {actions.map((action) => <Link key={action.href} href={action.href} className="group px-4 py-4 hover:bg-surface-2">
        <div className="flex items-center gap-2 text-[13px]"><span className="num text-[20px] font-semibold">{action.count}</span><span className="font-medium">{action.label}</span><span className="ml-auto text-brand" aria-hidden>→</span></div>
        <p className="mt-1 text-[12px] text-mute">{action.detail}</p>
      </Link>)}
    </div>
  </section>;
}
