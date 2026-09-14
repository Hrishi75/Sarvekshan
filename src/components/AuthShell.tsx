import Link from "next/link";
import type { ReactNode } from "react";
import { IconCamera, IconCheckList, IconRepair, IconSchool } from "./icons";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-backdrop min-h-screen p-3 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-24px)] max-w-[1060px] overflow-hidden rounded-[16px] border border-hair bg-surface sm:min-h-[calc(100vh-48px)] lg:min-h-[680px] lg:grid-cols-[minmax(0,1fr)_440px]">
        <section className="auth-story relative flex min-h-[240px] flex-col overflow-hidden bg-ink p-6 text-white sm:p-8 lg:min-h-0 lg:p-10">
          <div className="auth-orbit auth-orbit-one" />
          <div className="auth-orbit auth-orbit-two" />
          <Link href="/" className="relative z-10 flex w-fit items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand text-white">
              <IconSchool size={20} />
            </span>
            <span>
              <span className="block text-[16px] font-semibold tracking-[-0.02em]">Sarvekshan</span>
              <span className="mt-0.5 block text-[11px] text-white/55">School repair register</span>
            </span>
          </Link>

          <div className="relative z-10 mt-auto max-w-[520px] pt-12 lg:pt-24">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
              Evidence to lasting repairs
            </p>
            <h2 className="mt-3 max-w-[470px] text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] sm:text-[36px]">
              See what needs attention. Keep track of what gets fixed.
            </h2>
            <div className="mt-7 hidden grid-cols-3 gap-3 border-t border-white/15 pt-5 sm:grid">
              <StoryStep icon={<IconCamera size={16} />} label="Capture on site" />
              <StoryStep icon={<IconRepair size={16} />} label="Plan the repair" />
              <StoryStep icon={<IconCheckList size={16} />} label="Check it lasts" />
            </div>
          </div>
        </section>

        <section className="flex items-center px-5 py-8 sm:px-10 lg:px-11">
          <div className="w-full">{children}</div>
        </section>
      </div>
    </main>
  );
}

function StoryStep({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px] font-medium text-white/70">
      <span className="text-white/45">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
