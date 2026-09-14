import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { currentUser, sessionMustChangePassword } from "@/lib/session";
import { tx } from "@/lib/db";
import { listTeam } from "@/lib/team";
import { TeamManager } from "./TeamManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Team | Sarvekshan", robots: { index: false, follow: false },
};

export default async function TeamPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (user.role === "volunteer") redirect("/");
  if (await sessionMustChangePassword()) redirect("/password");
  const members = await tx((c) => listTeam(c, user));

  return <AppShell user={user}>
    <div className="mx-auto max-w-[1200px] p-4 sm:p-6">
      <TeamManager actor={{ id: user.id, role: user.role }} members={members} />
    </div>
  </AppShell>;
}
