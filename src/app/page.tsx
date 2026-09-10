import Link from "next/link";
import { q, q1 } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { survivalByWorkType } from "@/lib/survival";
import { findingsFor } from "@/lib/findings";
import { AppShell } from "@/components/AppShell";
import { SurvivalChart } from "@/components/SurvivalChart";
import { Card, Tag, rupees } from "@/components/ui";
import { IconExport, IconUp, IconDown } from "@/components/icons";
import { NextActions } from "@/components/NextActions";
import { PublicBoard } from "./PublicBoard";

export default async function Overview({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; block?: string }>;
}) {
  const user = await currentUser();
  // Signed out is not a dead end. The register has a public half — which school
  // is in what condition — and this is where it lives; sign-in is a button on it.
  if (!user) {
    const sp = await searchParams;
    return (
      <PublicBoard
        search={sp.q?.trim().slice(0, 200) || ""}
        block={sp.block?.trim().slice(0, 150) || ""}
      />
    );
  }

  const stats = await q1<{
    schools: string;
    avg_score: string | null;
    audits_month: string;
    audits_prev: string;
    released: string | null;
    verified: string | null;
    reversions: string;
    audits_by_week: number[];
  }>(
    `SELECT
      (SELECT count(*) FROM schools WHERE org_id=$1)                                AS schools,
      (SELECT round(avg(score)) FROM school_scores WHERE org_id=$1)                 AS avg_score,
      (SELECT count(*) FROM visits
        WHERE org_id=$1 AND occurred_at >= date_trunc('month', current_date))       AS audits_month,
      (SELECT count(*) FROM visits
        WHERE org_id=$1
          AND occurred_at >= date_trunc('month', current_date) - interval '1 month'
          AND occurred_at <  date_trunc('month', current_date))                     AS audits_prev,
      (SELECT sum(amount_released_paise) FROM grants WHERE org_id=$1)               AS released,
      (SELECT sum(amount_verified_paise) FROM grants WHERE org_id=$1)               AS verified,
      (SELECT count(*) FROM reversions r JOIN schools s ON s.id=r.school_id
        WHERE s.org_id=$1)                                                          AS reversions,
      (SELECT coalesce(array_agg(n ORDER BY wk), '{}') FROM (
         SELECT date_trunc('week', occurred_at) AS wk, count(*)::int AS n
           FROM visits WHERE org_id=$1 AND occurred_at > current_date - 56
          GROUP BY 1 ORDER BY 1
       ) w)                                                                         AS audits_by_week`,
    [user.org_id]
  );

  const scoreTrend = await q<{ n: string }>(
    `SELECT count(*)::text AS n FROM checks WHERE org_id=$1 AND state='done'`,
    [user.org_id]
  );

  const findings = (await findingsFor(user.org_id, 5));

  const survival = await survivalByWorkType(user.org_id);

  const avg = stats?.avg_score == null ? null : Number(stats.avg_score);
  const auditsMonth = Number(stats?.audits_month ?? 0);
  const auditsPrev = Number(stats?.audits_prev ?? 0);
  const auditsDelta = auditsMonth - auditsPrev;
  const released = Number(stats?.released ?? 0);
  const verified = Number(stats?.verified ?? 0);
  const weeks = stats?.audits_by_week ?? [];
  const worstSeries = survival[0];

  return (
    <AppShell user={user}>
      <div className="p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.025em]">Lucknow district</h1>
            <p className="mt-[3px] text-[13.5px] text-mute">
              {stats?.schools ?? 0} schools tracked · {scoreTrend[0]?.n ?? 0} follow-up checks
              completed
            </p>
          </div>
          <a
            href="/api/export?dataset=schools"
            className="inline-flex h-[31px] items-center gap-[6px] rounded-[7px] border border-hair bg-surface px-[11px] text-[12.5px] font-medium text-body hover:border-faint"
          >
            <IconExport size={13} />
            Export CSV
          </a>
        </div>

        <NextActions user={user} />
        {/* stat row */}
        <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Card>
            <div className="mb-[9px] text-[12px] font-medium text-mute">Average score</div>
            <div className="flex items-baseline gap-2">
              <span className="num text-[27px] font-semibold tracking-[-0.02em]">{avg ?? "—"}</span>
            </div>
            <p className="mt-[11px] text-[12px] leading-[1.4] text-mute">
              across {stats?.schools ?? 0} schools
            </p>
          </Card>

          <Card>
            <div className="mb-[9px] text-[12px] font-medium text-mute">Audits this month</div>
            <div className="flex items-baseline gap-2">
              <span className="num text-[27px] font-semibold tracking-[-0.02em]">{auditsMonth}</span>
              {auditsPrev > 0 && (
                <span
                  className={`num inline-flex items-center gap-[2px] text-[11.5px] font-semibold ${
                    auditsDelta >= 0 ? "text-good" : "text-bad"
                  }`}
                >
                  {auditsDelta >= 0 ? <IconUp size={11} /> : <IconDown size={11} />}
                  {Math.abs(auditsDelta)}
                </span>
              )}
            </div>
            <div className="mt-[11px] flex h-[26px] items-end gap-[2.5px]">
              {weeks.length > 0 ? (
                weeks.map((n, i) => (
                  <span
                    key={i}
                    className={`grow rounded-[1.5px] ${i === weeks.length - 1 ? "bg-brand" : "bg-hair"}`}
                    style={{ height: `${Math.max(8, (n / Math.max(...weeks)) * 100)}%` }}
                  />
                ))
              ) : (
                <span className="text-[12px] text-faint">no visits yet</span>
              )}
            </div>
          </Card>

          <Card>
            <div className="mb-[9px] text-[12px] font-medium text-mute">Grants tracked</div>
            <div className="num text-[27px] font-semibold tracking-[-0.02em]">
              {rupees(released, true)}
            </div>
            <p className="mt-[11px] text-[12px] leading-[1.4] text-mute">
              <span className="num font-semibold text-bad">
                {rupees(released - verified, true)}
              </span>{" "}
              unverified on site
            </p>
          </Card>

          <Card>
            <div className="mb-[9px] text-[12px] font-medium text-mute">Reverted repairs</div>
            <div className="num text-[27px] font-semibold tracking-[-0.02em] text-bad">
              {stats?.reversions ?? 0}
            </div>
            <p className="mt-[11px] text-[12px] leading-[1.4] text-mute">
              fixed, then broken again
            </p>
          </Card>
        </div>

        {/* survival + findings */}
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <Card className="min-w-0 !p-[18px_20px_14px_20px]">
            <div className="text-[14.5px] font-semibold tracking-[-0.01em]">
              What survives after we leave
            </div>
            <p className="mb-[14px] mt-[2px] text-[12.5px] text-mute">
              Share still working, by days since the repair
            </p>
            <SurvivalChart series={survival} />
            {worstSeries && (
              <p className="mt-1 border-t border-hair-soft pt-[11px] text-[12.5px] leading-[1.5] text-body">
                <strong className="font-semibold text-ink">{worstSeries.label}</strong> is the
                weakest line here. Missed checks are excluded from the denominator rather than
                counted as working.
              </p>
            )}
          </Card>

          <Card pad={false} className="flex min-w-0 flex-col overflow-hidden">
            <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
              <span className="text-[14.5px] font-semibold tracking-[-0.01em]">Needs attention</span>
              <span className="num text-[11px] text-faint">{findings.length}</span>
            </div>
            {findings.length === 0 ? (
              <p className="px-[18px] pb-6 text-[13px] text-mute">Nothing outstanding.</p>
            ) : (
              findings.map((f, i) => (
                <Link
                  key={i}
                  href={`/schools/${f.school_id}`}
                  className="flex items-start gap-[11px] border-t border-hair-soft px-[18px] py-[11px] hover:bg-surface-2"
                >
                  <span
                    className={`mt-[6px] h-[6px] w-[6px] shrink-0 rounded-full ${
                      f.tone === "bad" ? "bg-bad" : "bg-warn"
                    }`}
                  />
                  <span className="min-w-0 grow">
                    <span className="block truncate text-[13px] font-medium tracking-[-0.005em]">
                      {f.school_name}
                    </span>
                    <span className="mt-px block text-[12px] text-mute">{f.detail}</span>
                  </span>
                  <Tag tone={f.tone === "bad" ? "bad" : "warn"}>{f.kind}</Tag>
                </Link>
              ))
            )}
            <div className="grow" />
            <Link
              href="/findings"
              className="border-t border-hair-soft px-[18px] py-[10px] text-[12.5px] font-medium text-brand"
            >
              View all findings →
            </Link>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
