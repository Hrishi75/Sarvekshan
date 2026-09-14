"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage, db, getPosition, newId } from "@/lib/offline";

type Result = "functional" | "degraded" | "failed" | "inaccessible";

const RESULTS: { key: Result; label: string; tone: string }[] = [
  { key: "functional", label: "Still working", tone: "bg-good text-white" },
  { key: "degraded", label: "Partly working", tone: "bg-warn text-white" },
  { key: "failed", label: "Broken again", tone: "bg-bad text-white" },
  { key: "inaccessible", label: "Could not see it", tone: "bg-surface-2 text-body border border-hair" },
];

export function CheckForm({ checkId }: { checkId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!result) return;
    setSaving(true);
    const clientUuid = newId();
    const now = new Date().toISOString();
    const pos = await getPosition();

    await db.transaction("rw", db.checks, db.media, async () => {
      await db.checks.put({
        client_uuid: clientUuid,
        check_id: checkId,
        result,
        note_text: note.trim() || undefined,
        lat: pos?.coords.latitude,
        lng: pos?.coords.longitude,
        completed_at: now,
        synced: 0,
      });
      if (photo) {
        await db.media.put({
          client_uuid: newId(),
          owner_kind: "check",
          owner_client_uuid: checkId,
          kind: "condition",
          mime: photo.type || "image/jpeg",
          blob: photo,
          captured_at: now,
          lat: pos?.coords.latitude,
          lng: pos?.coords.longitude,
          synced: 0,
        });
      }
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => router.push("/checks"), 1200);
  }

  if (saved) {
    return (
      <div className="rounded border border-good/30 bg-good-soft px-4 py-6 text-center">
        <p className="text-lg font-semibold text-good">Saved on this phone</p>
        <p className="mt-1 text-sm text-body">It uploads by itself when there is signal.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {RESULTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setResult(r.key)}
            className={`flex min-h-14 items-center justify-between rounded px-5 text-left font-semibold ${
              result === r.key ? r.tone : "border border-hair bg-surface text-ink"
            }`}
          >
            <span>{r.label}</span>
          </button>
        ))}
      </div>

      <label className="tap flex cursor-pointer items-center justify-center rounded border-2 border-dashed border-brand/30 bg-surface font-semibold text-brand">
        {photo ? "Photo taken — retake" : "Take photo from the same spot"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setPhoto(await compressImage(f));
          }}
        />
      </label>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Anything to add (optional)"
        className="w-full rounded border border-hair bg-surface px-3 py-2 text-sm"
      />
      <p className="text-xs leading-relaxed text-mute">
        Keep people out of photos and do not record children&apos;s names or identifying details.
      </p>

      <button
        onClick={save}
        disabled={!result || saving}
        className="tap rounded bg-brand px-4 text-lg font-semibold text-white disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save check"}
      </button>
    </div>
  );
}
