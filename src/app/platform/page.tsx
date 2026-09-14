import type { Metadata } from "next";
import Link from "next/link";
import {
  IconAlert,
  IconCamera,
  IconCheckList,
  IconGrant,
  IconGrid,
  IconRepair,
  IconSchool,
} from "@/components/icons";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "How the platform works | Sarvekshan",
  description:
    "How Sarvekshan connects school conditions, repair work, public money, and long-term follow-up evidence.",
};

const records = [
  { name: "School", detail: "The permanent place record", icon: <IconSchool size={18} /> },
  { name: "Visit", detail: "A dated observation on site", icon: <IconCamera size={18} /> },
  { name: "Work", detail: "The repair decision and cost", icon: <IconRepair size={18} /> },
  { name: "Check", detail: "Did the repair keep working?", icon: <IconCheckList size={18} /> },
];

const workflow = [
  ["Record", "A volunteer selects a school and facility, then taps the condition they can see. It saves before it uploads."],
  ["Decide", "A coordinator reviews the evidence and creates owned repair work with a target and estimate."],
  ["Complete", "The team records who performed the repair, when it finished, what it used, and what it cost."],
  ["Return", "Follow-ups are scheduled automatically. A different local checker records whether the repair still works."],
  ["Learn", "Survival and cost measures reveal which repair types last and which repeatedly fail."],
  ["Publish", "The public sees school conditions, money, missing evidence, and durability without personal identities or photographs."],
] as const;

const roles = [
  { title: "Public", detail: "Inspect the register, condition evidence, grant gaps, and what has lasted.", icon: <IconGrid size={17} /> },
  { title: "Field volunteer", detail: "Capture conditions quickly, with large targets and an offline queue.", icon: <IconCamera size={17} /> },
  { title: "Local checker", detail: "Revisit completed repairs so durability is independently observed.", icon: <IconCheckList size={17} /> },
  { title: "Coordinator", detail: "Triage reports, assign owners, manage costs, and move overdue work.", icon: <IconRepair size={17} /> },
] as const;

const measures = [
  ["Coverage", "Schools with a recent site visit"],
  ["Response", "Time from report to owned repair"],
  ["Delivery", "Repairs completed by their target"],
  ["Verification", "Released money verified on site"],
  ["Independence", "Checks completed by a different person"],
  ["Durability", "Repairs still functional at the six-month check"],
] as const;

export default async function PlatformPage() {
  const user = await currentUser();

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-hair bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[58px] max-w-[1160px] items-center gap-3 px-4 sm:px-7">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-brand text-white">
              <IconSchool size={16} />
            </span>
            <span>
              <span className="block text-[14px] font-semibold tracking-[-0.015em]">Sarvekshan</span>
              <span className="hidden text-[10.5px] text-faint sm:block">School repair register</span>
            </span>
          </Link>
          <span className="grow" />
          <Link href="/" className="inline-flex min-h-10 items-center px-2 text-[12.5px] font-medium text-body hover:text-ink">Public register</Link>
          <Link href={user ? "/" : "/signin"} className="inline-flex min-h-10 items-center rounded-[7px] bg-brand px-4 text-[13px] font-semibold text-white hover:opacity-90">{user ? "Open workspace" : "Sign in"}</Link>
        </div>
      </header>

      <main>
        <section className="platform-hero overflow-hidden border-b border-hair bg-ink text-white">
          <div className="mx-auto grid max-w-[1160px] gap-10 px-4 py-14 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Platform definition</p>
              <h1 className="mt-4 max-w-[720px] text-[38px] font-semibold leading-[1.04] tracking-[-0.045em] sm:text-[54px]">A public evidence trail for school repairs.</h1>
              <p className="mt-6 max-w-[690px] text-[15px] leading-[1.7] text-white/68 sm:text-[16px]">
                Sarvekshan connects what somebody sees at a school, the repair a team decides to make, what it costs, and whether it still works months later.
              </p>
            </div>
            <div className="border-l border-white/15 pl-5">
              <p className="text-[13.5px] leading-[1.65] text-white/68">The platform exists to answer one operational question:</p>
              <p className="mt-3 text-[20px] font-semibold leading-[1.35] tracking-[-0.02em]">Did the repair create a result that lasted?</p>
              <Link href="/#schools" className="mt-6 inline-flex min-h-11 items-center rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white">Explore the evidence →</Link>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[1160px] px-4 pb-20 sm:px-7">
          <PlatformSection eyebrow="System of record" title="Four records form one permanent chain" intro="Every feature strengthens the link between a place, the condition seen there, the work that follows, and the later proof that it lasted.">
            <div className="grid gap-px overflow-hidden rounded-[11px] border border-hair bg-hair md:grid-cols-4">
              {records.map((record, index) => (
                <div key={record.name} className="relative bg-surface p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-brand-soft text-brand">{record.icon}</span>
                    <span className="num text-[11px] text-faint">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-[15px] font-semibold">{record.name}</h3>
                  <p className="mt-1 text-[12.5px] leading-[1.5] text-mute">{record.detail}</p>
                  {index < records.length - 1 && <span className="absolute -right-[7px] top-1/2 z-10 hidden h-3.5 w-3.5 rotate-45 border-r border-t border-hair bg-surface md:block" />}
                </div>
              ))}
            </div>
          </PlatformSection>

          <PlatformSection eyebrow="Operating loop" title="From observation to accountability" intro="The same evidence moves through the whole workflow. There is no reporting copy, shadow spreadsheet, or separate donor version.">
            <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {workflow.map(([title, detail], index) => (
                <li key={title} className="rounded-[11px] border border-hair bg-surface p-5">
                  <div className="flex items-center gap-3">
                    <span className="num flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">{index + 1}</span>
                    <h3 className="text-[14px] font-semibold">{title}</h3>
                  </div>
                  <p className="mt-3 text-[12.5px] leading-[1.6] text-body">{detail}</p>
                </li>
              ))}
            </ol>
          </PlatformSection>

          <PlatformSection eyebrow="People" title="One platform, distinct responsibilities" intro="Each role sees the work needed for its decision. Public transparency and private operations use the same underlying record.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {roles.map((role) => (
                <div key={role.title} className="rounded-[11px] border border-hair bg-surface p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-hair bg-surface-2 text-body">{role.icon}</span>
                  <h3 className="mt-4 text-[14px] font-semibold">{role.title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-[1.55] text-mute">{role.detail}</p>
                </div>
              ))}
            </div>
          </PlatformSection>

          <div className="grid border-b border-hair lg:grid-cols-2 lg:divide-x lg:divide-hair">
            <section className="py-10 lg:pr-10">
              <p className="page-kicker">Evidence contract</p>
              <h2 className="text-[23px] font-semibold tracking-[-0.03em]">The rules that make the record trustworthy</h2>
              <ul className="mt-6 grid gap-4">
                <Rule icon={<IconCamera size={16} />} title="Observed on site" detail="A school without a visit has no score. Missing evidence remains visible as a gap." />
                <Rule icon={<IconCheckList size={16} />} title="Checked independently" detail="The system derives who is independent. A missed check never becomes a passing check." />
                <Rule icon={<IconAlert size={16} />} title="Honest about failure" detail="Repairs that break again remain attached to their original work and cost." />
                <Rule icon={<IconGrant size={16} />} title="Money tied to evidence" detail="Released amounts stay distinct from expenditure accounted for and work verified on site." />
              </ul>
            </section>

            <section className="py-10 lg:pl-10">
              <p className="page-kicker">Boundaries</p>
              <h2 className="text-[23px] font-semibold tracking-[-0.03em]">Infrastructure evidence, with a narrow data footprint</h2>
              <p className="mt-4 text-[13.5px] leading-[1.65] text-body">Sarvekshan does not manage student records, attendance, marks, payroll, procurement, or the transfer of grant money. It stores no identifiable child data.</p>
              <div className="mt-6 rounded-[10px] border border-hair bg-surface p-5">
                <h3 className="text-[13.5px] font-semibold">Public by default</h3>
                <p className="mt-2 text-[12.5px] leading-[1.6] text-mute">School conditions, aggregate repair outcomes, and money gaps are public. Personal names, account details, and photographs remain inside the signed-in workspace.</p>
              </div>
              <div className="mt-3 rounded-[10px] border border-hair bg-surface p-5">
                <h3 className="text-[13.5px] font-semibold">Offline by design</h3>
                <p className="mt-2 text-[12.5px] leading-[1.6] text-mute">Field evidence is saved on the device before upload. The interface distinguishes saved work from uploaded work.</p>
              </div>
            </section>
          </div>

          <PlatformSection eyebrow="Success" title="Measure outcomes rather than activity" intro="Counts explain workload. The platform earns its place when it shows whether repairs delivered durable results.">
            <div className="grid gap-px overflow-hidden rounded-[11px] border border-hair bg-hair sm:grid-cols-2 lg:grid-cols-3">
              {measures.map(([name, detail]) => (
                <div key={name} className={`bg-surface p-5 ${name === "Durability" ? "relative before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-brand" : ""}`}>
                  <h3 className="text-[14px] font-semibold">{name}</h3>
                  <p className="mt-1.5 text-[12.5px] text-mute">{detail}</p>
                  {name === "Durability" && <span className="mt-4 inline-flex rounded-[5px] bg-brand-soft px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-brand">North-star measure</span>}
                </div>
              ))}
            </div>
          </PlatformSection>

          <section className="mt-10 flex flex-col items-start justify-between gap-5 rounded-[12px] bg-ink p-6 text-white sm:flex-row sm:items-center sm:p-8">
            <div>
              <p className="text-[19px] font-semibold tracking-[-0.02em]">See the platform through its evidence.</p>
              <p className="mt-1.5 text-[13px] text-white/60">Browse the public school condition register without an account.</p>
            </div>
            <Link href="/#schools" className="inline-flex min-h-11 shrink-0 items-center rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white">Open the register →</Link>
          </section>
        </div>
      </main>
    </div>
  );
}

function PlatformSection({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-hair py-10 sm:py-12">
      <p className="page-kicker">{eyebrow}</p>
      <div className="mb-7 grid gap-3 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-end">
        <h2 className="max-w-[620px] text-[25px] font-semibold tracking-[-0.035em] sm:text-[30px]">{title}</h2>
        <p className="text-[13.5px] leading-[1.6] text-mute">{intro}</p>
      </div>
      {children}
    </section>
  );
}

function Rule({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-brand-soft text-brand">{icon}</span>
      <span>
        <span className="block text-[13.5px] font-semibold">{title}</span>
        <span className="mt-1 block text-[12.5px] leading-[1.55] text-mute">{detail}</span>
      </span>
    </li>
  );
}
