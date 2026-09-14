import { redirect } from "next/navigation";
import { z } from "zod";
import { q, q1 } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { FieldShell } from "@/components/FieldShell";
import type { FacilityType } from "@/lib/types";
import { VisitFlow, type NearbySchool } from "./VisitFlow";

export default async function VisitPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const facilities = await q<FacilityType>(
    `SELECT key, label_en, sort_order FROM facility_types ORDER BY sort_order`
  );
  const { school } = await searchParams;
  const initialSchool = school && z.uuid().safeParse(school).success
    ? await q1<NearbySchool>(`SELECT id, name, village, block, NULL::text AS distance_m FROM schools WHERE id=$1 AND org_id=$2`, [school, user.org_id])
    : null;

  return (
    <FieldShell title="Report something" subtitle="Takes under a minute" back="/" user={user}>
      <VisitFlow key={initialSchool?.id ?? "nearby"} facilities={facilities} initialSchool={initialSchool} />
    </FieldShell>
  );
}
