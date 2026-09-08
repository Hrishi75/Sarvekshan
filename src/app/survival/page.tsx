import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { survivalByWorkType } from "@/lib/survival";
import { AppShell } from "@/components/AppShell";
import { SurvivalChart } from "@/components/SurvivalChart";
import { Card, Empty, rupees, ExportLink } from "@/components/ui";

export default async function SurvivalPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const series = await survivalByWorkType(user.org_id);

  return (
    <AppShell user={user}>
      <div className="border-b border-hair bg-surface px-7 pb-5 pt-[22px]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="mb-[3px] text-[24px] font-semibold tracking-[-0.025em]">
              What survives after we leave
            </h1>
            <p className="text-[13.5px] text-mute">
              Share of completed work still functional at each checkpoint, by work type.
            </p>
          </div>
          <ExportLink dataset="survival" />
        </div>
      </div>

      <div className="p-7">
        {series.length === 0 ? (
          <Empty>
            No completed checks yet. The first real numbers arrive about three months after the
            earliest repair.
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <Card className="!p-[18px_20px_14px_20px]">
              <SurvivalChart series={series} />
            </Card>

            <div className="overflow-hidden rounded-[9px] border border-hair bg-surface">
              <div className="eyebrow flex border-b border-hair px-4 py-[9px]">
                <span className="grow">Work type</span>
                <span className="w-[56px] text-right">Done</span>
                {[7, 90, 180, 365].map((d) => (
                  <span key={d} className="w-[62px] text-right">
                    {d === 7 ? "Day 7" : `${d}d`}
                  </span>
                ))}
                <span className="w-[104px] text-right">Spent</span>
                <span className="w-[124px] text-right">Per lasting</span>
              </div>

              {series.map((s) => (
                <div
                  key={s.work_type_key}
                  className="flex items-center border-b border-hair-soft px-4 py-[12px] last:border-b-0"
                >
                  <span className="min-w-0 grow truncate text-[13.5px] font-medium">{s.label}</span>
                  <span className="num w-[56px] text-right text-[12.5px] text-body">{s.n_works}</span>
                  {s.points.map((p) => (
                    <span
                      key={p.offset_days}
                      title={p.n > 0 ? `n=${p.n}` : "no checks yet"}
                      className={`num w-[62px] text-right text-[12.5px] font-semibold ${
                        p.pct == null
                          ? "text-faint"
                          : p.pct >= 70
                            ? "text-good"
                            : p.pct >= 40
                              ? "text-warn"
                              : "text-bad"
                      }`}
                    >
                      {p.pct == null ? "—" : `${Math.round(p.pct)}%`}
                    </span>
                  ))}
                  <span className="num w-[104px] text-right text-[12.5px]">
                    {rupees(s.spend_paise)}
                  </span>
                  <span className="num w-[124px] text-right text-[12.5px] font-semibold text-bad">
                    {s.none_survived
                      ? `none @ ${s.lasting_at_days}d`
                      : s.lasting_paise != null
                        ? rupees(s.lasting_paise)
                        : "—"}
                  </span>
                </div>
              ))}
            </div>

            <p className="px-1 text-[12.5px] leading-[1.6] text-mute">
              <strong className="font-semibold text-ink">Per lasting</strong> divides everything
              spent on a work type by how much of it is still functional at the last checkpoint with
              data — the true cost, usually several times the headline figure. Missed checks are
              excluded from the denominator rather than counted as working, and a survival rate of
              zero is reported as a finding rather than left blank.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
