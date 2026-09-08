"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconGrid,
  IconSchool,
  IconAlert,
  IconCamera,
  IconGrant,
  IconCheckList,
} from "./icons";

type Nav = { href: string; label: string; icon: ReactNode; count?: number; alert?: boolean };

export function Sidebar({
  user,
  counts,
  blocks,
}: {
  user: { name: string; role: string };
  counts: { schools: number; findings: number; checks: number; inbox: number };
  blocks: { block: string; n: number; avg_score: number | null }[];
}) {
  const path = usePathname();

  // Two shells, two groups. Desk work and field work are different products —
  // the sidebar says so rather than mixing them into one flat list.
  const desk: Nav[] = [
    { href: "/", label: "Overview", icon: <IconGrid size={16} /> },
    { href: "/schools", label: "Schools", icon: <IconSchool size={16} />, count: counts.schools },
    {
      href: "/findings",
      label: "Findings",
      icon: <IconAlert size={16} />,
      count: counts.findings,
      alert: true,
    },
    { href: "/survival", label: "Survival", icon: <IconCheckList size={16} /> },
    { href: "/grants", label: "Grants", icon: <IconGrant size={16} /> },
  ];

  const field: Nav[] = [
    { href: "/visit", label: "New audit", icon: <IconCamera size={16} /> },
    { href: "/checks", label: "Follow-ups", icon: <IconCheckList size={16} />, count: counts.checks },
    // triage is a coordinator decision; /inbox redirects volunteers away, so the
    // link would be a dead end for them
    ...(user.role === "volunteer"
      ? []
      : [
          {
            href: "/inbox",
            label: "Triage",
            icon: <IconAlert size={16} />,
            count: counts.inbox,
            alert: true,
          } as Nav,
        ]),
  ];

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function Item({ n }: { n: Nav }) {
    const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
    return (
      <Link
        href={n.href}
        className={`flex h-[34px] items-center gap-[10px] rounded-[6px] px-[9px] text-[13.5px] ${
          active
            ? "bg-brand-soft font-semibold text-brand"
            : "font-medium text-body hover:bg-surface-2"
        }`}
      >
        {n.icon}
        {n.label}
        {n.count != null && n.count > 0 && (
          <span
            className={`ml-auto font-mono text-[10.5px] ${
              n.alert
                ? "rounded-[4px] bg-bad-soft px-[6px] py-[2px] font-semibold text-bad"
                : "text-faint"
            }`}
          >
            {n.count}
          </span>
        )}
      </Link>
    );
  }

  return (
    <aside className="flex w-[232px] shrink-0 flex-col overflow-y-auto border-r border-hair bg-surface">
      <Link href="/" className="flex items-center gap-[9px] px-[18px] pb-[20px] pt-[18px]">
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-brand text-white">
          <IconSchool size={15} />
        </span>
        <span className="text-[15px] font-semibold tracking-[-0.015em]">Sarvekshan</span>
      </Link>

      <div className="eyebrow mx-[18px] mb-[8px]">Desk</div>
      <nav className="flex flex-col gap-px px-[10px]">
        {desk.map((n) => (
          <Item key={n.href} n={n} />
        ))}
      </nav>

      <div className="eyebrow mx-[18px] mb-[8px] mt-[20px]">Field</div>
      <nav className="flex flex-col gap-px px-[10px]">
        {field.map((n) => (
          <Item key={n.href} n={n} />
        ))}
      </nav>

      {blocks.length > 0 && (
        <>
          <div className="eyebrow mx-[18px] mb-[10px] mt-[20px]">Blocks</div>
          <div className="flex flex-col gap-px px-[10px]">
            {blocks.map((b) => (
              <Link
                key={b.block}
                href={`/schools?block=${encodeURIComponent(b.block)}`}
                className="flex h-[31px] items-center gap-[9px] rounded-[6px] px-[9px] text-[13px] text-body hover:bg-surface-2"
              >
                <span
                  className={`h-[7px] w-[7px] shrink-0 rounded-[2px] ${
                    b.avg_score == null
                      ? "bg-hair"
                      : b.avg_score >= 70
                        ? "bg-good"
                        : b.avg_score >= 50
                          ? "bg-warn"
                          : "bg-bad"
                  }`}
                />
                <span className="truncate">{b.block}</span>
                <span className="ml-auto font-mono text-[11px] text-faint">{b.n}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="grow" />
      <div className="sticky bottom-0 flex items-center gap-[9px] border-t border-hair-soft bg-surface px-4 py-3">
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
          {initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-medium">{user.name}</span>
          <span className="block text-[11px] capitalize text-faint">{user.role}</span>
        </span>
      </div>
    </aside>
  );
}
