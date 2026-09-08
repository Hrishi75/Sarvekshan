import Link from "next/link";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { Card, Empty, rupees, ExportLink } from "@/components/ui";

type Row = {
  school_id: string; school_name: string; ay: string;
  sanctioned: string | null; released: string | null;
  accounted: string | null; verified: string | null; released_on: string | null;
};

export default async function GrantsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const rows = await q<Row>(
    `SELECT g.school_id, s.name AS school_name, g.ay,
            g.amount_sanctioned_paise::text AS sanctioned,
            g.amount_released_paise::text   AS released,
            g.amount_accounted_paise::text  AS accounted,
            g.amount_verified_paise::text   AS verified,
            g.released_on::text
       FROM grants g JOIN schools s ON s.id=g.school_id
      WHERE g.org_id=$1
      ORDER BY (g.amount_released_paise - COALESCE(g.amount_verified_paise,0)) DESC`,
    [user.org_id]
  );

  const tot = rows.reduce(
    (a, r) => ({
      sanctioned: a.sanctioned + Number(r.sanctioned ?? 0),
      released: a.released + Number(r.released ?? 0),
      accounted: a.accounted + Number(r.accounted ?? 0),
      verified: a.verified + Number(r.verified ?? 0),
    }),
    { sanctioned: 0, released: 0, accounted: 0, verified: 0 }
  );

  return (
    <AppShell user={user}>
      <div className="border-b border-hair bg-surface px-7 pb-5 pt-[22px]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="mb-[3px] text-[24px] font-semibold tracking-[-0.025em]">Grants</h1>
            <p className="text-[13.5px] text-mute">
              Sanctioned, released, accounted for on paper, and actually seen on the ground.
            </p>
          </div>
          <ExportLink dataset="grants" />
        </div>
      </div>

      <div className="p-7">
        <div className="mb-4 grid grid-cols-4 gap-3">
          <Card><Total label="Sanctioned" value={rupees(tot.sanctioned, true)} tone="text-ink" /></Card>
          <Card><Total label="Released" value={rupees(tot.released, true)} tone="text-good" /></Card>
          <Card><Total label="Accounted" value={rupees(tot.accounted, true)} tone="text-warn" /></Card>
          <Card><Total label="Seen on site" value={rupees(tot.verified, true)} tone="text-bad" /></Card>
        </div>

        {rows.length === 0 ? (
          <Empty>No grant records yet.</Empty>
        ) : (
          <div className="overflow-hidden rounded-[9px] border border-hair bg-surface">
            <div className="eyebrow flex border-b border-hair px-4 py-[9px]">
              <span className="grow">School</span>
              <span className="w-[110px] text-right">Released</span>
              <span className="w-[110px] text-right">Accounted</span>
              <span className="w-[110px] text-right">Seen on site</span>
              <span className="w-[150px] pl-4">Verified share</span>
            </div>
            {rows.map((r) => {
              const rel = Number(r.released ?? 0);
              const ver = Number(r.verified ?? 0);
              const pct = rel > 0 ? Math.round((ver / rel) * 100) : 0;
              return (
                <Link
                  key={r.school_id}
                  href={`/schools/${r.school_id}`}
                  className="flex items-center border-b border-hair-soft px-4 py-[12px] last:border-b-0 hover:bg-surface-2"
                >
                  <span className="min-w-0 grow truncate text-[13.5px] font-medium">{r.school_name}</span>
                  <span className="num w-[110px] text-right text-[12.5px]">{rupees(rel)}</span>
                  <span className="num w-[110px] text-right text-[12.5px] text-warn">{rupees(Number(r.accounted ?? 0))}</span>
                  <span className="num w-[110px] text-right text-[12.5px] text-bad">{rupees(ver)}</span>
                  <span className="flex w-[150px] items-center gap-[9px] pl-4">
                    <span className="h-[5px] grow overflow-hidden rounded-full bg-hair-soft">
                      <span
                        className={`block h-full rounded-full ${pct >= 70 ? "bg-good" : pct >= 40 ? "bg-warn" : "bg-bad"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="num w-[30px] text-right text-[12px] font-semibold">{pct}%</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Total({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <>
      <div className="mb-[9px] text-[12px] font-medium text-mute">{label}</div>
      <div className={`num text-[24px] font-semibold tracking-[-0.02em] ${tone}`}>{value}</div>
    </>
  );
}
