# Sarvekshan platform definition

## One-sentence definition

Sarvekshan is a public evidence and operations platform for teams repairing government schools: it connects what somebody sees on site, the work the team decides to do, what that work costs, and whether the repair still functions months later.

## The problem

School repair programmes usually have fragments rather than a record. A photograph sits in a messaging group, a grant amount sits in a spreadsheet, a repair is discussed on a call, and nobody returns after completion. The programme can report activity but cannot reliably answer four basic questions:

1. What is broken now?
2. Who owns the repair and when is it due?
3. Did the released money produce something visible on site?
4. Did the repair continue to work after the team left?

Sarvekshan makes those questions one continuous evidence trail.

## Who the platform serves

| User | Job to be done | Access |
| --- | --- | --- |
| Public visitor | See current school conditions, tracked money, coverage gaps, and repair durability | Public board; no names or photographs |
| Field volunteer | Record a school condition in under a minute, including when the network is unavailable | Field capture, assigned follow-ups, school directory |
| Local checker | Revisit a completed repair and record whether it still works | Assigned follow-ups; independence is derived |
| Coordinator | Turn reports into owned repair work, manage dates and costs, and resolve overdue work | Desk dashboard, triage, repairs, schools, exports |
| Administrator | Provision accounts and operate the deployment | Coordinator access plus account and deployment administration |

## The records it owns

Sarvekshan has four operational records. Every feature must strengthen the link between them rather than create a parallel workflow.

1. **School** — the permanent place record.
2. **Visit** — what somebody observed at that place on a specific date.
3. **Work** — the repair decision, owner, target, materials, and cost created from evidence.
4. **Check** — a later observation of whether completed work remains functional.

The chain is permanent: `School → Visit → Work → Check`. Photographs, grants, facility types, users, and scores support those records; they do not replace them.

## The operating loop

1. A coordinator adds the school once. Unknown values remain unknown.
2. A field volunteer selects the school and facility, taps the observed condition, and optionally captures a photograph or voice note. The record is saved on the device before upload.
3. A coordinator reviews a reported problem and either creates repair work or records why no work is needed.
4. The repair receives an owner, target date, estimate, completion evidence, final cost, and performer.
5. Completion schedules follow-ups at 7, 90, 180, and 365 days. The database creates these checks so every completion path behaves the same way.
6. A checker records functional, degraded, failed, or inaccessible. The platform derives whether the check is independent of the person who performed the repair.
7. The public board updates from the same records and exposes coverage gaps alongside school conditions.

## Evidence contract

- A condition is a dated site observation, never a desk assumption.
- A school without site evidence has no score.
- A missed follow-up is excluded from the survival denominator; it is never a pass.
- A value that is absent stays absent. The interface does not convert missing evidence into a failure or success.
- Every offline retry carries the same client identifier and is safe to submit again.
- Check independence is derived from people and organisations; nobody chooses it in a form.
- Public pages omit names and photographs. Signed-in records still contain the minimum attribution required to operate the work.
- The platform stores no identifiable child data, marks, or attendance.

## Product surfaces

### Public board

The public board answers: what is known, where are the gaps, what money is tracked, and what has lasted? It publishes every school in the register while withholding personal attribution and media.

### Desk workspace

The desk workspace answers: what needs a decision today? It prioritises unreviewed reports, unowned or overdue repairs, due follow-ups, grant verification gaps, and recurring failures.

### Field workspace

The field workspace answers: what can I record here, now, with one hand? Capture has large targets, no required typing, and an offline queue that distinguishes saved from uploaded.

## Success measures

The platform should report these from its own evidence:

- **Coverage:** share of registered schools with a recent site visit.
- **Response:** median time from a problem report to owned repair work.
- **Delivery:** share of open repairs completed by the target date.
- **Verification:** share of released grant value verified on site.
- **Independence:** share of completed checks performed independently.
- **Durability:** share of completed repairs independently verified functional after 180 days.

The north-star measure is **repair durability at 180 days**. Activity counts matter only when they help explain or improve that outcome.

## Product boundaries

Sarvekshan does not manage student records, attendance, marks, payroll, procurement, or the transfer of grant money. It records school infrastructure evidence and the repair work connected to it. It is not a substitute for emergency services or a statutory building-safety inspection.

New features should be rejected when they require identifiable child data, weaken the evidence chain, hide missing follow-ups, create a second source of truth, or make field capture slower than sending the same report through a messaging app.

## Release contract

A production release must keep the capture flow functional offline, apply database migrations before serving traffic, use a durable media volume, reject the development sign-in bypass, protect session, invitation, and phone-hash secrets, pass `npm run check` and `npm run build`, and return a healthy database readiness response from `/api/health`.
