import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { findingsFor } from "@/lib/findings";
import { AppShell } from "@/components/AppShell";
import { Empty, Tag } from "@/components/ui";
import { IconChevron } from "@/components/icons";

const EXPLAIN: Record<string, string> = {
  REVERT: "A repair we completed has failed again",
  GRANT: "Money released that no one has verified on site",
  LATE: "A follow-up check is past its due date",
  DISCL: "A disclosure the school already owes the public",
};

export default async function FindingsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const findings = await findingsFor(user.org_id, 60);
  const groups = ["REVERT", "GRANT", "LATE", "DISCL"] as const;

  return (
    <AppShell user={user}>
      <div className="border-b border-hair bg-surface px-7 pb-5 pt-[22px]">
        <h1 className="mb-[3px] text-[24px] font-semibold tracking-[-0.025em]">Findings</h1>
        <p className="text-[13.5px] text-mute">
          Derived live from evidence — nothing here is stored or hand-entered.
        </p>
      </div>

      <div className="p-7">
        {findings.length === 0 ? (
          <Empty>Nothing outstanding across the district.</Empty>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => {
              const items = findings.filter((f) => f.kind === g);
              if (items.length === 0) return null;
              return (
                <section key={g}>
                  <div className="mb-2 flex items-baseline gap-[10px]">
                    <Tag tone={items[0].tone}>{g}</Tag>
                    <span className="text-[13px] text-mute">{EXPLAIN[g]}</span>
                    <span className="num ml-auto text-[12px] text-faint">{items.length}</span>
                  </div>
                  <div className="overflow-hidden rounded-[9px] border border-hair bg-surface">
                    {items.map((f, i) => (
                      <Link
                        key={i}
                        href={`/schools/${f.school_id}`}
                        className="flex items-center gap-3 border-b border-hair-soft px-4 py-[13px] last:border-b-0 hover:bg-surface-2"
                      >
                        <span
                          className={`h-[6px] w-[6px] shrink-0 rounded-full ${
                            f.tone === "bad" ? "bg-bad" : "bg-warn"
                          }`}
                        />
                        <span className="w-[220px] shrink-0 truncate text-[13.5px] font-medium">
                          {f.school_name}
                        </span>
                        <span className="min-w-0 grow truncate text-[13px] text-body">{f.detail}</span>
                        <IconChevron size={14} className="shrink-0 text-faint" />
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
