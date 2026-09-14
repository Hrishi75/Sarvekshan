"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { schoolInput } from "@/lib/school-input";

const inputClass = "mt-1.5 min-h-11 w-full rounded-[7px] border border-hair bg-surface px-3 py-2 text-[14px]";

export function SchoolForm({ clientUuid, blocks }: { clientUuid: string; blocks: string[] }) {
  const router = useRouter();
  // Keep one identifier for every retry, including refreshes of server component props.
  const id = useRef(clientUuid);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const payload = { ...Object.fromEntries(new FormData(event.currentTarget)), client_uuid: id.current };
    const parsed = schoolInput.safeParse(payload);
    if (!parsed.success) { setError(parsed.error.issues[0].message); setExisting(null); return; }
    busy.current = true;
    setSaving(true);
    setError("");
    setExisting(null);
    try {
      const response = await fetch("/api/schools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) {
        setExisting(result.school_id ?? null);
        throw new Error(result.error ?? "Could not save the school. Try again.");
      }
      router.push(`/schools/${result.id}`);
      router.refresh();
    } catch (error) {
      setError(error instanceof TypeError ? "No connection. Your entries are still here. Reconnect and try again." : error instanceof Error ? error.message : "Could not save. Try again.");
      busy.current = false;
      setSaving(false);
    }
  }

  return <form onSubmit={submit}>
    <fieldset disabled={saving} className="space-y-5 disabled:opacity-60">
      <p className="text-[13px] text-mute">Only the school name is required. Add the other details when you know them.</p>
      <label className="block text-[13px] font-medium">School name
        <input name="name" required maxLength={200} autoComplete="off" className={inputClass} placeholder="Government Primary School Rampur" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="udise-code" className="text-[13px] font-medium">UDISE code</label>
          <input id="udise-code" name="udise_code" inputMode="numeric" maxLength={20} className={`${inputClass} num`} aria-describedby="udise-hint" />
          <p id="udise-hint" className="mt-1 text-[12px] text-mute">Optional. Use the code from the school’s records.</p>
        </div>
        <label className="text-[13px] font-medium">Pupils enrolled
          <input name="enrolment" type="number" min={0} max={2147483647} step={1} className={`${inputClass} num`} placeholder="Leave blank if unknown" />
        </label>
        <label className="text-[13px] font-medium">Village <input name="village" maxLength={150} className={inputClass} /></label>
        <label className="text-[13px] font-medium">Block
          <input name="block" maxLength={150} list="school-blocks" className={inputClass} />
          <datalist id="school-blocks">{blocks.map((block) => <option key={block} value={block} />)}</datalist>
        </label>
        <label className="text-[13px] font-medium">District <input name="district" maxLength={150} className={inputClass} /></label>
        <label className="text-[13px] font-medium">State <input name="state" maxLength={150} className={inputClass} /></label>
      </div>
      <details className="rounded-[7px] border border-hair p-3">
        <summary className="cursor-pointer text-[13px] font-medium">Map location · optional</summary>
        <p className="mt-2 text-[12px] text-mute">Coordinates put this school on the map and in nearby-school results.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="text-[13px] font-medium">Latitude <input name="lat" type="number" min={-90} max={90} step="any" className={`${inputClass} num`} /></label>
          <label className="text-[13px] font-medium">Longitude <input name="lng" type="number" min={-180} max={180} step="any" className={`${inputClass} num`} /></label>
        </div>
      </details>
      <p className="rounded-[7px] bg-canvas p-3 text-[12px] leading-relaxed text-mute">The school will show no score until someone records site conditions on a visit.</p>
    </fieldset>
    {error && <div role="alert" className="mt-4 rounded-[7px] bg-bad-soft p-3 text-[13px] text-bad">
      {error}{existing && <Link href={`/schools/${existing}`} className="mt-2 block font-semibold underline">Open the existing school</Link>}
    </div>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hair-soft pt-4">
      <p className="text-[12px] text-mute">An internet connection is needed to add a school.</p>
      <button type="submit" disabled={saving} className="min-h-11 rounded-[7px] bg-brand px-5 text-[13px] font-semibold text-white disabled:opacity-50">{saving ? "Adding school…" : "Add school"}</button>
    </div>
  </form>;
}
