import { z } from "zod";
import { currentUser } from "@/lib/session";
import { tx } from "@/lib/db";
import { repairInput } from "@/lib/repair-input";
import { RepairError, updateRepair } from "@/lib/repairs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in again before saving this repair." }, { status: 401 });
  if (user.role === "volunteer") return Response.json({ error: "Only a coordinator can update repairs." }, { status: 403 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Repair not found." }, { status: 404 });
  const parsed = repairInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    await tx((c) => updateRepair(c, user, id, parsed.data));
    return Response.json({ saved: true });
  } catch (error) {
    if (error instanceof RepairError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Repair update failed", error);
    return Response.json({ error: "Could not save the repair. Your entries are still here; try again." }, { status: 500 });
  }
}
