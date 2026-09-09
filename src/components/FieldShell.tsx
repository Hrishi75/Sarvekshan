import Link from "next/link";
import type { ReactNode } from "react";
import { IconSignOut } from "./icons";

export function FieldShell({
  title,
  subtitle,
  back,
  user,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  /**
   * Who this device is signed in as. Field phones get handed around a village,
   * and a check is assigned to a person — independence is derived from who
   * captured it, so capturing under someone else's name is a data-integrity bug
   * before it is a security one. Pass it wherever there is a session.
   */
  user?: { name: string };
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
          {user && <FieldAccount name={user.name} />}
        </div>
      </header>
      <main className="grow px-4 py-4">{children}</main>
    </div>
  );
}

/** Initials say who is capturing; the door gets them out on a shared handset. */
function FieldAccount({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex shrink-0 items-center gap-[4px]">
      <Link
        href="/password"
        title={`${name} — change password`}
        className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white"
      >
        {initials}
      </Link>
      <form action="/api/signout" method="post">
        <button
          type="submit"
          aria-label={`Sign out ${name}`}
          title="Sign out"
          className="flex h-11 w-9 items-center justify-center rounded-[7px] text-mute hover:bg-surface-2"
        >
          <IconSignOut size={16} />
        </button>
      </form>
    </div>
  );
}
