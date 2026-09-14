"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  compressImage,
  db,
  getPosition,
  newId,
  type QueuedMedia,
} from "@/lib/offline";
import type { FacilityType } from "@/lib/types";

export type NearbySchool = {
  id: string;
  name: string;
  village: string | null;
  block: string | null;
  distance_m: string | null;
};

type Step = "school" | "facility" | "state" | "capture" | "done";
type FacilityState = "working" | "problem" | "broken";

const STATE_META: { key: FacilityState; label: string; tone: string }[] = [
  { key: "working", label: "Working", tone: "bg-good text-white" },
  { key: "problem", label: "Problem", tone: "bg-warn text-white" },
  { key: "broken", label: "Broken", tone: "bg-bad text-white" },
];

export function VisitFlow({ facilities, initialSchool = null }: { facilities: FacilityType[]; initialSchool?: NearbySchool | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialSchool ? "facility" : "school");

  const [schools, setSchools] = useState<NearbySchool[]>([]);
  const [located, setLocated] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(!initialSchool);
  const [school, setSchool] = useState<NearbySchool | null>(initialSchool);
  const [facility, setFacility] = useState<FacilityType | null>(null);
  const [facilityState, setFacilityState] = useState<FacilityState | null>(null);

  const [photo, setPhoto] = useState<Blob | null>(null);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const posRef = useRef<{ lat: number; lng: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Step 1 — work out which school we are standing in. Never a search box.
  useEffect(() => {
    let alive = true;
    (async () => {
      const pos = await getPosition();
      if (pos) posRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (initialSchool) return;
      const qs = pos
        ? `?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
        : "";
      try {
        const res = await fetch(`/api/schools/nearby${qs}`);
        const data = await res.json();
        if (!alive) return;
        setSchools(data.schools ?? []);
        setLocated(Boolean(data.located));
      } catch {
        /* offline and no cached list — the picker shows the empty state */
      } finally {
        if (alive) setLoadingSchools(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [initialSchool]);

  // derived, not state — creating it in an effect causes a cascading render
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const onPhoto = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(await compressImage(file));
  }, []);

  const toggleRecording = useCallback(async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => chunksRef.current.push(ev.data);
      rec.onstop = () => {
        setVoice(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, [recording]);

  // Everything is written locally. The network is never on the critical path.
  const save = useCallback(async () => {
    if (!school || !facility || !facilityState) return;
    setSaving(true);

    const visitId = newId();
    const obsId = newId();
    const now = new Date().toISOString();
    const pos = posRef.current;

    try {
      await db.transaction("rw", db.visits, db.observations, db.media, async () => {
        await db.visits.put({
          client_uuid: visitId,
          school_id: school.id,
          occurred_at: now,
          synced: 0,
        });
        await db.observations.put({
          client_uuid: obsId,
          visit_client_uuid: visitId,
          school_id: school.id,
          facility_key: facility.key,
          state: facilityState,
          note_text: note.trim() || undefined,
          lat: pos?.lat,
          lng: pos?.lng,
          synced: 0,
        });
        const media: QueuedMedia[] = [];
        if (photo) {
          media.push({
            client_uuid: newId(),
            owner_kind: "observation",
            owner_client_uuid: obsId,
            kind: "condition",
            mime: photo.type || "image/jpeg",
            blob: photo,
            captured_at: now,
            lat: pos?.lat,
            lng: pos?.lng,
            synced: 0,
          });
        }
        if (voice) {
          media.push({
            client_uuid: newId(),
            owner_kind: "observation",
            owner_client_uuid: obsId,
            kind: "voice",
            mime: voice.type || "audio/webm",
            blob: voice,
            captured_at: now,
            synced: 0,
          });
        }
        if (media.length) await db.media.bulkPut(media);
      });
      setStep("done");
    } finally {
      setSaving(false);
    }
  }, [school, facility, facilityState, note, photo, voice]);

  // ── render ────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="flex flex-col items-center gap-5 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-good-soft text-3xl text-good">
          ✓
        </div>
        <div>
          <h2 className="text-xl font-semibold">Saved on this phone</h2>
          <p className="mt-1 text-sm text-body">
            It will upload by itself when there is signal. You can close the app.
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <button
            onClick={() => {
              setFacility(null);
              setFacilityState(null);
              setPhoto(null);
              setVoice(null);
              setNote("");
              setStep("facility");
            }}
            className="tap rounded bg-brand px-4 font-semibold text-white"
          >
            Report another thing here
          </button>
          <button
            onClick={() => router.push("/")}
            className="tap rounded border border-hair bg-surface px-4 font-medium text-body"
          >
            Done for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Progress step={step} />

      {step === "school" && (
        <section>
          <StepTitle n={1} title="Which school?" hint={located ? "Nearest first" : "Your block"} />
          {loadingSchools ? (
            <p className="py-8 text-center text-sm text-mute">Finding you…</p>
          ) : schools.length === 0 ? (
            <p className="rounded border border-dashed border-brand/30 px-4 py-8 text-center text-sm text-mute">
              No schools available offline yet. Open this once with signal.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {schools.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      setSchool(s);
                      setStep("facility");
                    }}
                    className="tap flex w-full items-center justify-between gap-3 rounded border border-hair bg-surface px-4 text-left hover:border-brand"
                  >
                    <span>
                      <span className="block font-semibold leading-tight">{s.name}</span>
                      <span className="block text-xs text-mute">{s.village ?? s.block}</span>
                    </span>
                    {s.distance_m != null && (
                      <span className="shrink-0 font-mono text-xs text-mute">
                        {formatDistance(Number(s.distance_m))}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link href="/schools" className="tap mt-3 flex items-center justify-center rounded border border-hair bg-surface px-4 text-sm font-medium text-brand">Browse all schools</Link>
        </section>
      )}

      {step === "facility" && (
        <section>
          <StepTitle n={2} title="What are you looking at?" hint={school?.name} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {facilities.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setFacility(f);
                  setStep("state");
                }}
                className="flex min-h-24 flex-col items-center justify-center gap-1 rounded border border-hair bg-surface px-2 py-3 text-center hover:border-brand"
              >
                <span className="text-sm font-semibold leading-tight">{f.label_en}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "state" && (
        <section>
          <StepTitle n={3} title="What is its condition?" hint={facility?.label_en} />
          <div className="flex flex-col gap-2">
            {STATE_META.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setFacilityState(s.key);
                  setStep("capture");
                }}
                className={`flex min-h-16 items-center justify-between rounded px-5 text-left text-lg font-semibold ${s.tone}`}
              >
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "capture" && (
        <section className="flex flex-col gap-4">
          <StepTitle
            n={4}
            title="Photo and voice note"
            hint="Optional. Keep people out of frame and do not record children's names."
          />

          <label className="tap flex cursor-pointer items-center justify-center gap-2 rounded border-2 border-dashed border-brand/30 bg-surface font-semibold text-brand">
            {photo ? "Retake photo" : "Take photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPhoto}
              className="hidden"
            />
          </label>

          {photoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photoUrl}
              alt="What you just photographed"
              className="max-h-64 w-full rounded border border-hair object-cover"
            />
          )}

          <button
            onClick={toggleRecording}
            className={`tap flex items-center justify-center gap-2 rounded border-2 font-semibold ${
              recording
                ? "border-bad bg-bad text-white"
                : voice
                  ? "border-good bg-good-soft text-good"
                  : "border-dashed border-brand/30 bg-surface text-brand"
            }`}
          >
            {recording ? "◼ Stop recording" : voice ? "✓ Voice note saved — record again" : "🎤 Hold a voice note"}
          </button>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Type only if you want to (optional)"
            className="w-full rounded border border-hair bg-surface px-3 py-2 text-sm"
          />

          <button
            onClick={save}
            disabled={saving}
            className="tap rounded bg-brand px-4 text-lg font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </section>
      )}
    </div>
  );
}

function StepTitle({ n, title, hint }: { n: number; title: string; hint?: string | null }) {
  return (
    <div className="mb-3">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-mute">
        Step {n} of 4
      </span>
      <h2 className="text-xl font-semibold leading-tight">{title}</h2>
      {hint && <p className="text-sm text-mute">{hint}</p>}
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  const order: Step[] = ["school", "facility", "state", "capture"];
  const i = order.indexOf(step);
  return (
    <div className="flex gap-1" aria-hidden>
      {order.map((s, idx) => (
        <span
          key={s}
          className={`h-1 flex-1 rounded-full ${idx <= i ? "bg-brand" : "bg-hair"}`}
        />
      ))}
    </div>
  );
}

function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return "";
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}
