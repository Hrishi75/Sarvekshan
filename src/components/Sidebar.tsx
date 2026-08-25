"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconGrid, IconSchool, IconAlert, IconCamera, IconGrant } from "./icons";

type Nav = { href: string; label: string; icon: ReactNode; count?: number; alert?: boolean };

export function Sidebar({
  user,
  counts,
  blocks,
}: {
  user: { name: string; role: string };
  counts: { schools: number; findings: number; checks: number };
  blocks: { block: string; n: number; avg_score: number | null }[];
}) {
  const path = usePathname();
  const nav: Nav[] = [
    { href: "/", label: "Overview", icon: <IconGrid size={16} /> },
    { href: "/schools", label: "Schools", icon: <IconSchool size={16} />, count: counts.schools },
    { href: "/visit", label: "Audit", icon: <IconCamera size={16} /> },
    {
      href: "/findings",
      label: "Findings",
      icon: <IconAlert size={16} />,
      count: counts.findings,
      alert: true,
    },
    { href: "/grants", label: "Grants", icon: <IconGrant size={16} /> },
  ];

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-hair bg-surface">
      <Link href="/" className="flex items-center gap-[9px] px-[18px] pb-[22px] pt-[18px]">
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-brand text-white">
          <IconSchool size={15} />
        </span>
        <span className="text-[15px] font-semibold tracking-[-0.015em]">Sarvekshan</span>
      </Link>

      <nav className="flex flex-col gap-px px-[10px]">
        {nav.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
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
        })}
      </nav>

      {blocks.length > 0 && (
        <>
          <div className="eyebrow mx-[18px] mb-[10px] mt-[22px]">Blocks</div>
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
      <div className="flex items-center gap-[9px] border-t border-hair-soft px-4 py-3">
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
