import { NextResponse } from "next/server";
import { z } from "zod";
import { q1 } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { putObject } from "@/lib/storage";

const ownerKind = z.enum(["observation", "check", "work", "photo_point"]);
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

function coordinate(value: FormDataEntryValue | null, min: number, max: number) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const fd = await req.formData();
  const clientUuidRaw = z.uuid().safeParse(fd.get("client_uuid"));
  const ownerKindRaw = ownerKind.safeParse(String(fd.get("owner_kind") ?? ""));
  const ownerClientUuid = z.uuid().safeParse(fd.get("owner_client_uuid"));
  const kind = mediaKind.safeParse(String(fd.get("kind") ?? "condition"));
  const capturedAt = z.iso.datetime({ offset: true }).safeParse(
    String(fd.get("captured_at") ?? new Date().toISOString())
  );
  const lat = coordinate(fd.get("lat"), -90, 90);
  const lng = coordinate(fd.get("lng"), -180, 180);
  const file = fd.get("file");
  const mime = file instanceof Blob ? file.type.split(";")[0].toLowerCase() : "";

  // client_uuid becomes part of the storage key, so it is validated as a uuid
  // here and never taken as free text.
  if (
    !clientUuidRaw.success ||
    !ownerClientUuid.success ||
    !(file instanceof Blob) ||
    !ownerKindRaw.success ||
    !kind.success ||
    !capturedAt.success ||
    lat === undefined ||
    lng === undefined ||
    !allowedMime.has(mime) ||
    file.size <= 0 ||
    file.size > MAX_MEDIA_BYTES
  ) {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  const clientUuid = clientUuidRaw.data;

  // The owner id is client-supplied. Confirm it is a row in this org before
  // hanging media off it, or a caller can attach photos to another org's record.
  const owner = await q1<{ id: string }>(
    `SELECT $2::uuid AS id
      WHERE ($1::text = 'observation' AND EXISTS (
               SELECT 1 FROM observations WHERE id=$2 AND org_id=$3))
         OR ($1::text = 'check' AND EXISTS (
               SELECT 1 FROM checks WHERE id=$2 AND org_id=$3))
         OR ($1::text = 'work' AND EXISTS (
               SELECT 1 FROM works WHERE id=$2 AND org_id=$3))
         OR ($1::text = 'photo_point' AND EXISTS (
               SELECT 1 FROM photo_points WHERE id=$2 AND org_id=$3))`,
    [ownerKindRaw.data, ownerClientUuid.data, user.org_id]
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
    `INSERT INTO media
       (org_id, storage_key, kind, mime, bytes, captured_at, lat, lng,
        observation_id, check_id, work_id, photo_point_id, client_uuid)
     VALUES (
       $1,$2,$3::media_kind,$4,$5,$6,$7,$8,
       CASE WHEN $9::text='observation' THEN $10::uuid END,
       CASE WHEN $9::text='check' THEN $10::uuid END,
       CASE WHEN $9::text='work' THEN $10::uuid END,
       CASE WHEN $9::text='photo_point' THEN $10::uuid END,
       $11)
     ON CONFLICT (org_id, client_uuid) DO NOTHING
     RETURNING id`,
    [
      user.org_id,
      key,
      kind.data,
      mime,
      buf.byteLength,
      capturedAt.data,
      lat,
      lng,
      ownerKindRaw.data,
      ownerClientUuid.data,
      clientUuid,
    ]
  );

  return NextResponse.json({ ok: true, id: row?.id ?? null });
}
