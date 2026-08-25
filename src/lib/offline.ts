"use client";

import Dexie, { type Table } from "dexie";

/**
 * The device is the source of truth until the server acknowledges.
 * Nothing in the capture flow may require the network.
 */

export type QueuedVisit = {
  client_uuid: string;
  school_id: string;
  occurred_at: string;
  synced: 0 | 1;
};

export type QueuedObservation = {
  client_uuid: string;
  visit_client_uuid: string;
  school_id: string;
  facility_key: string;
  state: "working" | "problem" | "broken";
  note_text?: string;
  lat?: number;
  lng?: number;
  synced: 0 | 1;
};

export type QueuedCheck = {
  client_uuid: string;
  check_id: string;
  result: "functional" | "degraded" | "failed" | "inaccessible";
  note_text?: string;
  lat?: number;
  lng?: number;
  completed_at: string;
  synced: 0 | 1;
};

export type QueuedMedia = {
  client_uuid: string;
  /** which queued record this belongs to */
  owner_kind: "observation" | "check" | "work" | "photo_point";
  owner_client_uuid: string;
  kind: "condition" | "completion" | "bill" | "voice" | "reference";
  mime: string;
  blob: Blob;
  captured_at: string;
  lat?: number;
  lng?: number;
  synced: 0 | 1;
};

class FieldRegisterDB extends Dexie {
  visits!: Table<QueuedVisit, string>;
  observations!: Table<QueuedObservation, string>;
  checks!: Table<QueuedCheck, string>;
  media!: Table<QueuedMedia, string>;

  constructor() {
    super("field_register");
    this.version(1).stores({
      visits: "client_uuid, synced",
      observations: "client_uuid, visit_client_uuid, synced",
      checks: "client_uuid, check_id, synced",
      media: "client_uuid, owner_client_uuid, synced",
    });
  }
}

export const db = new FieldRegisterDB();

export function newId(): string {
  return crypto.randomUUID();
}

/** How many records are still waiting to reach the server. */
export async function pendingCount(): Promise<number> {
  const [v, o, c, m] = await Promise.all([
    db.visits.where("synced").equals(0).count(),
    db.observations.where("synced").equals(0).count(),
    db.checks.where("synced").equals(0).count(),
    db.media.where("synced").equals(0).count(),
  ]);
  return v + o + c + m;
}

/**
 * Shrink a photo before it ever enters the queue.
 * A 4 MB original will not clear a rural uplink; ~250 KB will.
 */
export async function compressImage(file: Blob, maxEdge = 1600, quality = 0.7): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/jpeg", quality)
  );
  return blob ?? file;
}

/** Best-effort location. Never blocks capture. */
export function getPosition(timeout = 6000): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 30_000 }
    );
  });
}

/**
 * Push everything unsynced. Safe to call repeatedly — every record carries a
 * client_uuid and the server upserts on it, so retries cannot duplicate.
 */
export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  const visits = await db.visits.where("synced").equals(0).toArray();
  const observations = await db.observations.where("synced").equals(0).toArray();
  const checks = await db.checks.where("synced").equals(0).toArray();

  if (visits.length || observations.length || checks.length) {
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visits, observations, checks }),
      });
      if (!res.ok) throw new Error(`sync failed: ${res.status}`);
      await db.transaction("rw", db.visits, db.observations, db.checks, async () => {
        for (const v of visits) await db.visits.update(v.client_uuid, { synced: 1 });
        for (const o of observations) await db.observations.update(o.client_uuid, { synced: 1 });
        for (const c of checks) await db.checks.update(c.client_uuid, { synced: 1 });
      });
      sent += visits.length + observations.length + checks.length;
    } catch {
      failed += visits.length + observations.length + checks.length;
    }
  }

  // media goes one at a time — a failed photo must not block the rest
  const media = await db.media.where("synced").equals(0).toArray();
  for (const m of media) {
    try {
      const fd = new FormData();
      fd.set("client_uuid", m.client_uuid);
      fd.set("owner_kind", m.owner_kind);
      fd.set("owner_client_uuid", m.owner_client_uuid);
      fd.set("kind", m.kind);
      fd.set("captured_at", m.captured_at);
      if (m.lat != null) fd.set("lat", String(m.lat));
      if (m.lng != null) fd.set("lng", String(m.lng));
      fd.set("file", m.blob, `${m.client_uuid}`);
      const res = await fetch("/api/media", { method: "POST", body: fd });
      if (!res.ok) throw new Error(String(res.status));
      await db.media.update(m.client_uuid, { synced: 1 });
      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}
