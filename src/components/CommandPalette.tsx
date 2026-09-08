"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchHit } from "@/app/api/search/route";
import { scoreColor } from "./ui";
import { IconSearch, IconGrid, IconSchool, IconAlert, IconCamera, IconGrant, IconCheckList } from "./icons";

type Cmd = { label: string; href: string; hint: string; icon: React.ReactNode };

const COMMANDS: Cmd[] = [
  { label: "Overview", href: "/", hint: "district summary", icon: <IconGrid size={15} /> },
  { label: "Schools", href: "/schools", hint: "every school in the district", icon: <IconSchool size={15} /> },
  { label: "What survives after we leave", href: "/survival", hint: "survival curves, cost per lasting outcome", icon: <IconCheckList size={15} /> },
  { label: "Findings", href: "/findings", hint: "reversions, unverified grants, overdue checks", icon: <IconAlert size={15} /> },
  { label: "Grants", href: "/grants", hint: "sanctioned to seen on site", icon: <IconGrant size={15} /> },
  { label: "Follow-up checks", href: "/checks", hint: "what is due in the field", icon: <IconCheckList size={15} /> },
  { label: "Triage inbox", href: "/inbox", hint: "observations waiting on a decision", icon: <IconAlert size={15} /> },
  { label: "New audit", href: "/visit", hint: "field capture", icon: <IconCamera size={15} /> },
];

/**
 * ⌘K palette. Renders its own topbar trigger so `AppShell` stays a server
 * component and the search affordance is never a decoration that does nothing.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setTerm("");
    setHits([]);
    setActive(0);
  }, []);

  const commands = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return COMMANDS;
    return COMMANDS.filter((c) => (c.label + " " + c.hint).toLowerCase().includes(t));
  }, [term]);

  const total = commands.length + hits.length;
  // derived, never corrected in an effect: when results shrink under the
  // highlight, clamping at render keeps it in range without a second pass
  const activeIdx = total === 0 ? 0 : Math.min(active, total - 1);

  // ── open / close ──────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else setOpen(true);
      } else if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // ── search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: ctl.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        setHits(data.schools ?? []);
      } catch {
        /* aborted or offline — the command list still works */
      }
    }, 110);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [term, open]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [router, close]
  );

  const onInputKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (total === 0 ? 0 : (i + 1) % total));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (total === 0 ? 0 : (i - 1 + total) % total));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIdx < commands.length) {
          const c = commands[activeIdx];
          if (c) go(c.href);
        } else {
          const s = hits[activeIdx - commands.length];
          if (s) go(`/schools/${s.id}`);
        }
      }
    },
    [activeIdx, commands, hits, total, go]
  );

  // keep the highlighted row in view when arrowing past the fold
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search schools, UDISE codes, findings"
        className="flex h-[34px] w-full max-w-[420px] items-center gap-[9px] rounded-[7px] border border-hair bg-canvas px-[11px] text-left hover:border-faint"
      >
        <IconSearch size={15} className="text-faint" />
        <span className="text-[13px] text-faint">Search schools, UDISE codes, findings</span>
        <span className="num ml-auto rounded-[4px] border border-hair px-[5px] text-[10.5px] text-faint">
          ⌘K
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 pt-[12vh]"
          onMouseDown={close}
          role="presentation"
        >
          <div
            className="w-full max-w-[560px] overflow-hidden rounded-[11px] border border-hair bg-surface"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            <div className="flex items-center gap-[10px] border-b border-hair px-[15px]">
              <IconSearch size={16} className="shrink-0 text-faint" />
              <input
                autoFocus
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKey}
                placeholder="Search schools, UDISE codes, or jump to a page"
                className="h-[50px] w-full bg-transparent text-[14px] outline-none placeholder:text-faint"
              />
              <kbd className="num shrink-0 rounded-[4px] border border-hair px-[5px] py-[2px] text-[10.5px] text-faint">
                esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-[6px]">
              {total === 0 && (
                <p className="px-[15px] py-8 text-center text-[13px] text-mute">
                  Nothing matches “{term}”.
                </p>
              )}

              {commands.length > 0 && (
                <>
                  <div className="eyebrow px-[15px] pb-[6px] pt-[7px]">Go to</div>
                  {commands.map((c, i) => (
                    <Row
                      key={c.href}
                      idx={i}
                      active={activeIdx === i}
                      onHover={setActive}
                      onPick={() => go(c.href)}
                    >
                      <span className="shrink-0 text-faint">{c.icon}</span>
                      <span className="text-[13.5px] font-medium">{c.label}</span>
                      <span className="truncate text-[12px] text-faint">{c.hint}</span>
                    </Row>
                  ))}
                </>
              )}

              {hits.length > 0 && (
                <>
                  <div className="eyebrow px-[15px] pb-[6px] pt-[11px]">Schools</div>
                  {hits.map((s, i) => {
                    const idx = commands.length + i;
                    return (
                      <Row
                        key={s.id}
                        idx={idx}
                        active={activeIdx === idx}
                        onHover={setActive}
                        onPick={() => go(`/schools/${s.id}`)}
                      >
                        <span className="shrink-0 text-faint">
                          <IconSchool size={15} />
                        </span>
                        <span className="min-w-0 shrink-0 truncate text-[13.5px] font-medium">
                          {s.name}
                        </span>
                        <span className="num truncate text-[11.5px] text-faint">
                          {s.udise_code ?? "no UDISE"} · {s.village ?? s.block}
                        </span>
                        {s.open_findings > 0 && (
                          <span className="num ml-auto shrink-0 rounded-[4px] bg-bad-soft px-[6px] py-[2px] text-[10.5px] font-semibold text-bad">
                            {s.open_findings}
                          </span>
                        )}
                        <span
                          className={`num shrink-0 text-[12.5px] font-semibold ${scoreColor(s.score)} ${
                            s.open_findings > 0 ? "" : "ml-auto"
                          }`}
                        >
                          {s.score ?? "—"}
                        </span>
                      </Row>
                    );
                  })}
                </>
              )}
            </div>

            <div className="flex items-center gap-[14px] border-t border-hair-soft bg-surface-2 px-[15px] py-[8px] text-[11.5px] text-faint">
              <Hint k="↑↓" label="navigate" />
              <Hint k="↵" label="open" />
              <Hint k="esc" label="close" />
              <span className="ml-auto">Scoped to your organisation</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  idx,
  active,
  onHover,
  onPick,
  children,
}: {
  idx: number;
  active: boolean;
  onHover: (i: number) => void;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      data-idx={idx}
      onMouseEnter={() => onHover(idx)}
      onClick={onPick}
      className={`flex w-full items-center gap-[10px] px-[15px] py-[8px] text-left ${
        active ? "bg-brand-soft" : ""
      }`}
    >
      {children}
    </button>
  );
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-[5px]">
      <kbd className="num rounded-[3px] border border-hair bg-surface px-[4px] text-[10px]">{k}</kbd>
      {label}
    </span>
  );
}
