import Link from "next/link";
import type { ReactNode } from "react";

export function FieldShell({
  title,
  subtitle,
  back,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[560px] flex-col bg-canvas">
      <header className="sticky top-0 z-10 border-b border-hair bg-surface">
        <div className="flex items-center gap-3 px-4 py-3">
          {back && (
            <Link
              href={back}
              aria-label="Back"
              className="-ml-2 flex h-11 w-10 items-center justify-center rounded-[7px] text-mute hover:bg-surface-2"
            >
              ←
            </Link>
          )}
          <div className="min-w-0 grow">
            <h1 className="truncate text-[17px] font-semibold tracking-[-0.02em]">{title}</h1>
            {subtitle && <p className="truncate text-[12px] text-faint">{subtitle}</p>}
          </div>
        </div>
      </header>
      <main className="grow px-4 py-4">{children}</main>
    </div>
  );
}
