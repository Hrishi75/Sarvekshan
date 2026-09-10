import { NextResponse } from "next/server";
import { z } from "zod";
import { q1 } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { putObject } from "@/lib/storage";

// Owner table per kind, so the id can be proved to belong to the caller's org
// before it is written as a foreign key.
const OWNER = {
  observation: { column: "observation_id", table: "observations" },
  check: { column: "check_id", table: "checks" },
  work: { column: "work_id", table: "works" },
  photo_point: { column: "photo_point_id", table: "photo_points" },
} as const;

type OwnerKind = keyof typeof OWNER;

const isOwnerKind = (v: string): v is OwnerKind => Object.hasOwn(OWNER, v);
const mediaKind = z.enum(["condition", "completion", "bill", "voice", "reference"]);
const allowedMime = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
]);
const MAX_MEDIA_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const fd = await req.formData();
  const clientUuidRaw = z.uuid().safeParse(fd.get("client_uuid"));
  const ownerKindRaw = String(fd.get("owner_kind") ?? "");
  const ownerClientUuid = z.uuid().safeParse(fd.get("owner_client_uuid"));
  const kind = mediaKind.safeParse(String(fd.get("kind") ?? "condition"));
  const capturedAt = String(fd.get("captured_at") ?? new Date().toISOString());
  const latRaw = fd.get("lat");
  const lngRaw = fd.get("lng");
  const file = fd.get("file");
  const mime = file instanceof Blob ? file.type.split(";")[0].toLowerCase() : "";

  // client_uuid becomes part of the storage key, so it is validated as a uuid
  // here and never taken as free text.
  if (
    !clientUuidRaw.success ||
    !ownerClientUuid.success ||
    !(file instanceof Blob) ||
    !isOwnerKind(ownerKindRaw) ||
    !kind.success ||
    !allowedMime.has(mime) ||
    file.size <= 0 ||
    file.size > MAX_MEDIA_BYTES
  ) {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  const clientUuid = clientUuidRaw.data;
  const ownerKind: OwnerKind = ownerKindRaw;
  const { column, table } = OWNER[ownerKind];

  // The owner id is client-supplied. Confirm it is a row in this org before
  // hanging media off it, or a caller can attach photos to another org's record.
  const owner = await q1<{ id: string }>(
    `SELECT id FROM ${table} WHERE id = $1 AND org_id = $2`,
    [ownerClientUuid.data, user.org_id]
  );
  if (!owner) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Already stored? A retry after a dropped response must not write twice.
  const existing = await q1<{ id: string }>(
    `SELECT id FROM media WHERE org_id = $1 AND client_uuid = $2`,
    [user.org_id, clientUuid]
  );
  if (existing) return NextResponse.json({ ok: true, id: existing.id, deduped: true });

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = (mime.split("/")[1] ?? "bin").replace(/[^a-z0-9]/gi, "");
  const key = `${user.org_id}/${clientUuid}.${ext}`;
  await putObject(key, buf);

  // observations arrive keyed by their own client_uuid, which is their id
  const row = await q1<{ id: string }>(
    `INSERT INTO media (org_id, storage_key, kind, mime, bytes, captured_at, lat, lng, ${column}, client_uuid)
     VALUES ($1,$2,$3::media_kind,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (org_id, client_uuid) DO NOTHING
     RETURNING id`,
    [
      user.org_id,
      key,
      kind.data,
      mime,
      buf.byteLength,
      capturedAt,
      latRaw ? Number(latRaw) : null,
      lngRaw ? Number(lngRaw) : null,
      ownerClientUuid.data,
      clientUuid,
    ]
  );

  return NextResponse.json({ ok: true, id: row?.id ?? null });
}
