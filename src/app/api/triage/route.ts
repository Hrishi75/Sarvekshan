import { NextResponse } from "next/server";
import { z } from "zod";
import { tx } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { RepairError, triageObservation } from "@/lib/repairs";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role === "volunteer") return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const fd = await req.formData().catch(() => null);
  const parsed = z.object({ observation_id: z.uuid(), action: z.enum(["create_work", "dismiss"]) })
    .safeParse(fd ? Object.fromEntries(fd) : null);
  if (!parsed.success) return NextResponse.json({ error: "Invalid triage request." }, { status: 400 });
  try {
    const workId = await tx((c) => triageObservation(c, user, parsed.data.observation_id, parsed.data.action));
    return NextResponse.redirect(new URL(workId ? `/repairs/${workId}` : "/inbox", req.url), { status: 303 });
  } catch (error) {
    if (!(error instanceof RepairError)) console.error("Triage failed", error);
    const url = new URL("/inbox", req.url);
    url.searchParams.set("error", error instanceof RepairError ? error.message : "Could not save your decision. Please try again.");
    return NextResponse.redirect(url, { status: 303 });
  }
}
