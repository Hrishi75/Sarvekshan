"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { paiseToInput, repairInput } from "@/lib/repair-input";

export type RepairValues = {
  id: string; revision: string; status: "planned" | "in_progress";
  work_type_key: string; description: string | null; materials: string | null;
  assigned_to_id: string | null; performed_by_id: string | null;
  target_date: string | null; done_on: string | null;
  est_cost_paise: string | null; actual_cost_paise: string | null;
};

const inputClass = "mt-1.5 min-h-11 w-full rounded-[7px] border border-hair bg-surface px-3 py-2 text-[14px] text-ink";

export function RepairForm({ work, people, types, today }: {
  work: RepairValues;
  people: { id: string; name: string; active: boolean }[];
  types: { key: string; label_en: string }[];
  today: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(work.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const busy = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { performed_by_id: "", done_on: "", ...values, revision: work.revision };
    const parsed = repairInput.safeParse(payload);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/repairs/${work.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(data.error ?? "Could not save this repair. Try again.");
      }
      // A full navigation gives the form the new row version and confirms the saved state.
      router.push(`/repairs/${work.id}?saved=1`);
      router.refresh();
    } catch (error) {
      setError(error instanceof TypeError ? "No connection. Your entries are still here. Reconnect and save again." : error instanceof Error ? error.message : "Could not save. Try again.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <fieldset disabled={saving} className="space-y-5 disabled:opacity-70">
        <div>
          <h2 className="text-[15px] font-semibold">Plan the repair</h2>
          <p className="mt-1 text-[13px] text-mute">Give the work an owner and a date to aim for.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-[13px] font-medium">Repair type
            <select name="work_type_key" defaultValue={work.work_type_key} className={inputClass} required>
              {types.map((type) => <option key={type.key} value={type.key}>{type.label_en}</option>)}
            </select>
          </label>
          <label className="text-[13px] font-medium">Responsible person
            <select name="assigned_to_id" defaultValue={work.assigned_to_id ?? ""} className={inputClass} required={status === "in_progress"}>
              <option value="">Unassigned</option>
              {people.map((person) => <option key={person.id} value={person.id} disabled={!person.active}>{person.name}{!person.active ? " (inactive)" : ""}</option>)}
            </select>
          </label>
          <label className="text-[13px] font-medium">Target date <span className="font-normal text-mute">· optional</span>
            <input name="target_date" type="date" defaultValue={work.target_date ?? ""} className={inputClass} />
          </label>
          <label className="text-[13px] font-medium">Estimated cost (₹) <span className="font-normal text-mute">· optional</span>
            <input name="est_cost" inputMode="decimal" placeholder="Not yet estimated" defaultValue={paiseToInput(work.est_cost_paise)} className={`${inputClass} num`} />
          </label>
        </div>
        <label className="block text-[13px] font-medium">What needs doing <span className="font-normal text-mute">· optional</span>
          <textarea name="description" defaultValue={work.description ?? ""} rows={3} maxLength={2000} className={inputClass} placeholder="Describe the repair for the person doing it" />
        </label>
        <label className="block text-[13px] font-medium">Materials and repair notes <span className="font-normal text-mute">· optional</span>
          <textarea name="materials" defaultValue={work.materials ?? ""} rows={2} maxLength={2000} className={inputClass} placeholder="Parts replaced, materials used, or anything to check next time" />
        </label>
        <div className="border-t border-hair-soft pt-5">
          <h2 className="text-[15px] font-semibold">Update progress</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-[13px] font-medium">Status
              <select name="status" value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="done">Completed</option>
              </select>
            </label>
            <label className="text-[13px] font-medium">Final cost (₹) <span className="font-normal text-mute">· {status === "done" ? "required" : "optional"}</span>
              <input name="actual_cost" inputMode="decimal" required={status === "done"} defaultValue={paiseToInput(work.actual_cost_paise)} className={`${inputClass} num`} placeholder="Enter 0 if there was no cost" />
            </label>
            {status === "done" && <>
              <label className="text-[13px] font-medium">Who did the repair?
                <select name="performed_by_id" defaultValue={work.performed_by_id ?? ""} required className={inputClass}>
                  <option value="">Choose the person who did it</option>
                  {people.filter((person) => person.active).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </label>
              <label className="text-[13px] font-medium">Completed on
                <input name="done_on" type="date" required max={today} defaultValue={work.done_on ?? today} className={inputClass} />
              </label>
            </>}
          </div>
        </div>
        {status === "done" && <div className="rounded-[7px] border border-brand/20 bg-brand-soft p-4 text-[13px] leading-relaxed text-body">
          <p className="font-semibold text-ink">The repair is finished. Now we find out if it lasts.</p>
          <p className="mt-1">Saving schedules checks at 7, 90, 180 and 365 days after completion, with a different local checker where one is available. The completed record will be locked to keep this follow-up history consistent.</p>
        </div>}
      </fieldset>
      {error && <div role="alert" className="mt-4 rounded-[7px] bg-bad-soft p-3 text-[13px] text-bad">
        {error}
        {conflict && <a href={`/repairs/${work.id}`} className="mt-2 block font-semibold underline">Reload latest record</a>}
      </div>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hair-soft pt-4">
        <span className="text-[12px] text-mute">An internet connection is needed to save.</span>
        <button disabled={saving || conflict} type="submit" className="min-h-11 rounded-[7px] bg-brand px-5 text-[13px] font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : status === "done" ? "Complete repair & schedule checks" : "Save repair"}
        </button>
      </div>
    </form>
  );
}
