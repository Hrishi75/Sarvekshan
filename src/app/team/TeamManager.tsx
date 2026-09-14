"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, Empty, Tag, type Tone } from "@/components/ui";
import { IconPlus, IconSearch, IconTeam } from "@/components/icons";
import { canManageMember, type TeamMember, type TeamResult, type TeamStatus } from "@/lib/team-input";
import type { UserRole } from "@/lib/types";

const inputClass = "mt-1.5 min-h-11 w-full rounded-[7px] border border-hair bg-surface px-3 py-2 text-[14px] outline-none focus:border-brand";
const secondary = "min-h-11 rounded-[7px] border border-hair bg-surface px-3 text-[12px] font-medium text-body hover:border-brand disabled:opacity-50";
const statuses: Record<TeamStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "good" },
  invited: { label: "Invited", tone: "brand" },
  expired: { label: "Invitation expired", tone: "warn" },
  invitation_locked: { label: "Invitation locked", tone: "warn" },
  not_activated: { label: "Not activated", tone: "plain" },
  temporary: { label: "Password change due", tone: "warn" },
  locked: { label: "Sign-in locked", tone: "bad" },
  inactive: { label: "Deactivated", tone: "plain" },
};
type MemberAction = "renew" | "recover" | "deactivate" | "reactivate";
type Selection = { action: "invite"; id: string } | { action: MemberAction; member: TeamMember };
const actionTitles: Record<MemberAction, string> = {
  renew: "Renew invitation", recover: "Issue temporary password", deactivate: "Deactivate account", reactivate: "Reactivate account",
};

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function TeamManager({ actor, members }: {
  actor: { id: string; role: UserRole }; members: TeamMember[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [result, setResult] = useState<TeamResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const busy = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const resultPanel = useRef<HTMLDivElement>(null);

  useEffect(() => { if (selection) panel.current?.focus(); }, [selection]);
  useEffect(() => { if (result) resultPanel.current?.focus(); }, [result]);

  function select(value: Selection) {
    setSelection(value); setResult(null); setError(""); setCopyNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || busy.current) return;
    const form = new FormData(event.currentTarget);
    const payload = selection.action === "invite" ? {
      action: "invite", client_uuid: selection.id, name: form.get("name"), phone: form.get("phone"),
      role: form.get("role"), block: form.get("block"), is_local_checker: form.get("is_local_checker") === "on",
    } : { action: selection.action, id: selection.member.id, revision: selection.member.revision };
    busy.current = true; setSaving(true); setError("");
    try {
      const response = await fetch("/api/team", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update this account.");
      setResult(body); setSelection(null); setCopyNotice("");
      router.refresh();
    } catch (error) {
      setError(error instanceof TypeError
        ? "Connection lost. The action may have completed. Your entries are still here; reload the team list before retrying."
        : error instanceof Error ? error.message : "Could not update this account. Reload the team list and try again.");
    } finally {
      busy.current = false; setSaving(false);
    }
  }

  async function copyCredential() {
    if (!result?.credential) return;
    try {
      await navigator.clipboard.writeText(result.credential.value);
      setCopyNotice("Copied. Share it directly with this person.");
    } catch {
      setCopyNotice("Select the code above to copy it manually.");
    }
  }

  const needle = search.trim().toLowerCase();
  const visible = members.filter((member) =>
    [member.name, member.block, member.phone_last4].some((value) => value?.toLowerCase().includes(needle)) &&
    (filter === "all" || (filter === "active" && member.active) ||
      (filter === "pending" && member.active && !member.has_password) || (filter === "inactive" && !member.active))
  );
  const selectedMember = selection && selection.action !== "invite" ? selection.member : null;

  return <>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="page-kicker">Workspace access</p>
        <h1 className="text-[24px] font-semibold tracking-[-0.025em]">Team</h1>
        <p className="mt-1 max-w-[660px] text-[13.5px] leading-relaxed text-mute">
          Invite people and help them get back into their account. {actor.role === "admin" ? "You can manage volunteers and coordinators." : "You can manage volunteers. An admin manages coordinator accounts."}
        </p>
      </div>
      <button type="button" disabled={saving} onClick={() => select({ action: "invite", id: crypto.randomUUID() })}
        className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white disabled:opacity-50">
        <IconPlus size={15} /> Invite member
      </button>
    </div>

    <div className="mb-5 grid grid-cols-3 overflow-hidden rounded-[9px] border border-hair bg-surface">
      {[
        { label: "Active accounts", count: members.filter((m) => m.active).length },
        { label: "Awaiting activation", count: members.filter((m) => m.active && !m.has_password).length },
        { label: "Deactivated", count: members.filter((m) => !m.active).length },
      ].map((item) => <div key={item.label} className="border-r border-hair-soft p-3 last:border-r-0 sm:p-4">
        <span className="num block text-[22px] font-semibold">{item.count}</span>
        <span className="text-[11.5px] text-mute sm:text-[12.5px]">{item.label}</span>
      </div>)}
    </div>

    {result && <div ref={resultPanel} tabIndex={-1} className="mb-5 rounded-[10px] border border-brand/30 bg-surface p-5 outline-none focus-visible:ring-2 focus-visible:ring-brand" role="status">
      <p className="font-semibold">{result.name}</p>
      <p className="mt-1 text-[13px] text-mute">{result.message}</p>
      {result.credential && <>
        <p className="mt-4 text-[12px] font-medium">{result.credential.kind === "invitation" ? "One-time invitation code" : "Temporary password"}</p>
        <code className="num mt-2 block select-all break-all rounded-[7px] bg-brand-soft p-3 text-[20px] font-semibold text-brand">{result.credential.value}</code>
        <p className="mt-3 text-[13px] leading-relaxed text-mute">
          {result.credential.kind === "invitation"
            ? <>Ask them to open <Link href="/signup" className="font-medium text-brand">Activate account</Link>, enter their registered phone number and this code, and choose a password. The code expires in <span className="num">7</span> days.</>
            : <>Ask them to <Link href="/signin" className="font-medium text-brand">sign in</Link> with their registered phone number and this password. They must choose their own password before continuing.</>}
        </p>
        <p className="mt-2 text-[12px] text-mute">Shown only here. Share it before closing this message; it cannot be retrieved later.</p>
      </>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {result.credential && <button type="button" onClick={copyCredential} className={secondary}>Copy {result.credential.kind === "invitation" ? "code" : "password"}</button>}
        <button type="button" onClick={() => setResult(null)} className={secondary}>Done</button>
        {copyNotice && <p className="text-[12px] text-mute">{copyNotice}</p>}
      </div>
    </div>}

    {selection && <div ref={panel} tabIndex={-1} className="mb-5 outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <Card className="!p-5">
        <h2 className="text-[15px] font-semibold">{selection.action === "invite" ? "Invite a team member" : `${actionTitles[selection.action]} · ${selectedMember?.name}`}</h2>
        <form onSubmit={submit} className="mt-4">
          <fieldset disabled={saving} className="disabled:opacity-60">
            {selection.action === "invite" ? <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-[13px] font-medium">Full name<input name="name" autoComplete="off" required maxLength={120} className={inputClass} /></label>
                <label className="text-[13px] font-medium">Phone number<input name="phone" type="tel" autoComplete="off" inputMode="tel" required maxLength={24} placeholder="98765 43210" className={`${inputClass} num`} /></label>
                <label className="text-[13px] font-medium">Role<select name="role" defaultValue="volunteer" className={inputClass}>
                  <option value="volunteer">Volunteer</option>{actor.role === "admin" && <option value="coordinator">Coordinator</option>}
                </select></label>
                <label className="text-[13px] font-medium">Block · optional<input name="block" maxLength={150} className={inputClass} /></label>
              </div>
              <label className="mt-4 flex min-h-11 items-center gap-3 text-[13px] font-medium"><input name="is_local_checker" type="checkbox" className="h-4 w-4 accent-brand" /> Local resident checker</label>
              <p className="text-[12px] text-mute">Select for residents who can revisit nearby repairs. Check independence is determined from who performs and checks each repair.</p>
              <p className="mt-4 text-[12px] text-mute">You will receive an invitation code to share. No message is sent automatically.</p>
            </> : <div className="space-y-3 text-[13px] leading-relaxed text-mute">
              {selection.action === "renew" && <p>The previous invitation will stop working. Share the new code directly with {selectedMember?.name}.</p>}
              {selection.action === "recover" && <p>This replaces their password and signs out their existing sessions. They will choose a new password on their next sign-in.</p>}
              {selection.action === "deactivate" && <>
                <p>They will lose access immediately. Their reports, repairs, and follow-up history remain in the register.</p>
                <p><span className="num font-semibold text-body">{selectedMember?.open_repairs}</span> open repairs and <span className="num font-semibold text-body">{selectedMember?.pending_checks}</span> pending checks will remain assigned to them. Review these assignments after deactivation.</p>
              </>}
              {selection.action === "reactivate" && <p>Restore access with {selectedMember?.has_password ? "a new temporary password" : "a new invitation"}. Previously issued credentials and sessions will not be restored.</p>}
            </div>}
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-hair-soft pt-4">
              <button type="submit" className={`min-h-11 rounded-[7px] px-4 text-[13px] font-semibold text-white ${selection.action === "deactivate" ? "bg-bad" : "bg-brand"}`}>
                {saving ? "Saving…" : selection.action === "invite" ? "Create invitation" : actionTitles[selection.action]}
              </button>
              <button type="button" onClick={() => { setSelection(null); setError(""); }} className={secondary}>Cancel</button>
              <span className="text-[12px] text-mute">Connection required</span>
            </div>
          </fieldset>
          {error && <div role="alert" className="mt-4 rounded-[7px] bg-bad-soft p-3 text-[13px] text-bad">
            <p>{error}</p>
            <button type="button" onClick={() => { setSelection(null); setError(""); router.refresh(); }} className="mt-2 min-h-11 font-semibold underline">Reload team list</button>
          </div>}
        </form>
      </Card>
    </div>}

    <div className="mb-4 flex flex-wrap gap-3">
      <label className="flex min-h-11 min-w-0 grow items-center gap-2 rounded-[7px] border border-hair bg-surface px-3">
        <IconSearch size={16} /><span className="sr-only">Search team</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, block, or last four phone digits" className="min-w-0 grow bg-transparent py-2 text-[13px] outline-none" />
      </label>
      <label className="sr-only" htmlFor="team-status">Account status</label>
      <select id="team-status" value={filter} onChange={(event) => setFilter(event.target.value)} className={`${secondary} min-w-[170px]`}>
        <option value="all">All accounts</option><option value="active">Active accounts</option><option value="pending">Awaiting activation</option><option value="inactive">Deactivated</option>
      </select>
    </div>

    {visible.length === 0 ? <Empty>No team members match this search.</Empty> : <ul className="space-y-3" aria-label="Team members">
      {visible.map((member) => <li key={member.id} className="rounded-[9px] border border-hair bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span aria-hidden className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-surface-2 text-mute sm:flex"><IconTeam size={17} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-[14px] font-semibold">{member.name}</h2>{member.id === actor.id && <Tag>You</Tag>}<Tag tone={statuses[member.status].tone}>{statuses[member.status].label}</Tag></div>
              <p className="mt-1 text-[12.5px] text-mute"><span className="capitalize">{member.role}</span> · {member.block ?? "Block not set"}{member.is_local_checker && " · Local checker"}</p>
              <p className="mt-1 text-[12px] text-mute">{member.phone_last4 ? <>Phone ending <span className="num">{member.phone_last4}</span></> : "Phone details unavailable"} · {member.last_login_at ? <>Last sign-in <span className="num">{dateLabel(member.last_login_at)}</span></> : "No sign-in recorded"}</p>
              {member.active && !member.has_password && member.invitation_expires_at && <p className="mt-1 text-[12px] text-mute">{member.status === "expired" ? "Invitation expired" : "Invitation expires"} <span className="num">{dateLabel(member.invitation_expires_at)}</span></p>}
            </div>
          </div>
          {canManageMember(actor, member) && <div className="flex flex-wrap gap-2" aria-label={`Actions for ${member.name}`}>
            {member.active ? <>
              <button type="button" disabled={saving} onClick={() => select({ action: member.has_password ? "recover" : "renew", member })} className={secondary}>{member.has_password ? "Temporary password" : "Renew invitation"}</button>
              <button type="button" disabled={saving} onClick={() => select({ action: "deactivate", member })} className={`${secondary} !text-bad`}>Deactivate</button>
            </> : <button type="button" disabled={saving} onClick={() => select({ action: "reactivate", member })} className={secondary}>Reactivate</button>}
          </div>}
        </div>
      </li>)}
    </ul>}
    <p className="mt-4 text-[12px] text-mute"><span className="num">{visible.length}</span> of <span className="num">{members.length}</span> accounts · Phone numbers are shown by their last four digits.</p>
  </>;
}
