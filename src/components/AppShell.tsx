import type { ReactNode } from "react";
import { q, q1 } from "@/lib/db";
import type { SessionUser } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { IconSearch, IconPlus } from "./icons";

export async function AppShell({
  user,
  children,
  actions,
}: {
  user: SessionUser;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const counts = await q1<{ schools: string; findings: string; checks: string }>(
    `SELECT
       (SELECT count(*) FROM schools WHERE org_id=$1)                       AS schools,
       (SELECT count(*) FROM reversions r
          JOIN schools s ON s.id=r.school_id WHERE s.org_id=$1)             AS findings,
       (SELECT count(*) FROM checks
         WHERE org_id=$1 AND state IN ('pending','sent'))                   AS checks`,
    [user.org_id]
  );

  const blocks = await q<{ block: string; n: string; avg_score: string | null }>(
    `SELECT s.block, count(*) AS n, round(avg(sc.score)) AS avg_score
       FROM schools s LEFT JOIN school_scores sc ON sc.school_id = s.id
      WHERE s.org_id=$1 AND s.block IS NOT NULL
      GROUP BY s.block ORDER BY s.block`,
    [user.org_id]
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        user={{ name: user.name, role: user.role }}
        counts={{
          schools: Number(counts?.schools ?? 0),
          findings: Number(counts?.findings ?? 0),
          checks: Number(counts?.checks ?? 0),
        }}
        blocks={blocks.map((b) => ({
          block: b.block,
          n: Number(b.n),
          avg_score: b.avg_score == null ? null : Number(b.avg_score),
        }))}
      />

      <div className="flex min-w-0 grow flex-col">
        <header className="flex h-[56px] shrink-0 items-center gap-[14px] border-b border-hair bg-surface px-6">
          <div className="flex h-[34px] w-full max-w-[420px] items-center gap-[9px] rounded-[7px] border border-hair bg-canvas px-[11px]">
            <IconSearch size={15} className="text-faint" />
            <span className="text-[13px] text-faint">Search schools, UDISE codes, findings</span>
            <span className="ml-auto rounded-[4px] border border-hair px-[5px] font-mono text-[10.5px] text-faint">
              /
            </span>
          </div>
          <div className="grow" />
          {actions ?? (
            <a
              href="/visit"
              className="inline-flex h-[32px] items-center gap-[7px] rounded-[7px] bg-brand px-[13px] text-[13px] font-semibold text-white"
            >
              <IconPlus size={14} />
              New audit
            </a>
          )}
        </header>

        <main className="min-h-0 grow overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
