import Link from "next/link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";
import { SchoolForm } from "./SchoolForm";

export default async function NewSchoolPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (user.role === "volunteer") redirect("/schools");
  const blocks = await q<{ block: string }>(
    `SELECT DISTINCT block FROM schools WHERE org_id=$1 AND block IS NOT NULL ORDER BY block`, [user.org_id]
  );
  return <AppShell user={user}>
    <div className="mx-auto max-w-[800px] p-4 sm:p-6">
      <Link href="/schools" className="inline-block py-2 text-[13px] font-medium text-brand">← All schools</Link>
      <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.025em]">Add a school</h1>
      <p className="mb-6 mt-1 text-[13.5px] text-mute">Create its permanent record. Visits, repairs, and follow-ups will stay together here.</p>
      <Card className="!p-5"><SchoolForm clientUuid={randomUUID()} blocks={blocks.map((row) => row.block)} /></Card>
    </div>
  </AppShell>;
}
