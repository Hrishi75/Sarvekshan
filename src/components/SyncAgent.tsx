"use client";

import { useEffect, useState } from "react";
import { flushQueue, pendingCount } from "@/lib/offline";

/**
 * Drains the offline queue whenever the network comes back.
 * The badge shows what is still on the device — the field worker needs to know
 * the difference between "saved" and "reached the server".
 */
export function SyncAgent() {
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;

    async function refresh() {
      if (!alive) return;
      try {
        setPending(await pendingCount());
      } catch {
        /* IndexedDB unavailable (private mode) — the UI just shows nothing */
      }
    }

    async function drain() {
      if (!navigator.onLine || busy) return;
      setBusy(true);
      try {
        await flushQueue();
      } finally {
        setBusy(false);
        refresh();
      }
    }

    refresh();
    drain();
    const onOnline = () => drain();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => {
      refresh();
      drain();
    }, 20_000);

    return () => {
      alive = false;
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  if (pending === 0) return null;

  return (
    <div className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-full border border-warn/30 bg-warn-soft px-4 py-2 font-mono text-xs text-warn shadow-lg">
      {busy ? "sending…" : `${pending} saved on this phone`}
    </div>
  );
}
