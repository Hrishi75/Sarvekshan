import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { FieldShell } from "@/components/FieldShell";
import type { FacilityType } from "@/lib/types";
import { VisitFlow } from "./VisitFlow";

export default async function VisitPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const facilities = await q<FacilityType>(
    `SELECT key, label_en, label_hi, sort_order FROM facility_types ORDER BY sort_order`
  );

  return (
    <FieldShell title="Report something" subtitle="Takes under a minute" back="/" user={user}>
      <VisitFlow facilities={facilities} />
    </FieldShell>
  );
}
