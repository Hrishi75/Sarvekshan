import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { putObject } from "@/lib/storage";

const OWNER_COLUMN = {
  observation: "observation_id",
  check: "check_id",
  work: "work_id",
  photo_point: "photo_point_id",
} as const;

type OwnerKind = keyof typeof OWNER_COLUMN;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const fd = await req.formData();
  const clientUuid = String(fd.get("client_uuid") ?? "");
  const ownerKind = String(fd.get("owner_kind") ?? "") as OwnerKind;
  const ownerClientUuid = String(fd.get("owner_client_uuid") ?? "");
  const kind = String(fd.get("kind") ?? "condition");
  const capturedAt = String(fd.get("captured_at") ?? new Date().toISOString());
  const latRaw = fd.get("lat");
  const lngRaw = fd.get("lng");
  const file = fd.get("file");

  if (!clientUuid || !(file instanceof Blob) || !OWNER_COLUMN[ownerKind]) {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  // Already stored? A retry after a dropped response must not write twice.
  const existing = await q1<{ id: string }>(
    `SELECT id FROM media WHERE org_id = $1 AND client_uuid = $2`,
    [user.org_id, clientUuid]
  );
  if (existing) return NextResponse.json({ ok: true, id: existing.id, deduped: true });

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = (file.type.split("/")[1] ?? "bin").replace(/[^a-z0-9]/gi, "");
  const key = `${user.org_id}/${clientUuid}.${ext}`;
  await putObject(key, buf);

  const column = OWNER_COLUMN[ownerKind];
  // observations arrive keyed by their own client_uuid, which is their id
  const row = await q1<{ id: string }>(
    `INSERT INTO media (org_id, storage_key, kind, mime, bytes, captured_at, lat, lng, ${column}, client_uuid)
     VALUES ($1,$2,$3::media_kind,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (org_id, client_uuid) DO NOTHING
     RETURNING id`,
    [
      user.org_id,
      key,
      kind,
      file.type || null,
      buf.byteLength,
      capturedAt,
      latRaw ? Number(latRaw) : null,
      lngRaw ? Number(lngRaw) : null,
      ownerClientUuid || null,
      clientUuid,
    ]
  );

  return NextResponse.json({ ok: true, id: row?.id ?? null });
}
