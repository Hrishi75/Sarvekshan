# Sarvekshan — working notes

Operations tool for village school repair work. See README.md for how to run it.

## Non-negotiables

- **Capture must beat WhatsApp.** Under sixty seconds, no typing required, works
  with the network off. Any change that slows the field flow to help a report is
  the wrong trade — the field worker feeds this system, and abandonment is the
  most likely failure mode.
- **Never show "uploaded" when you mean "saved".** The field worker needs to know
  the difference. `SyncAgent` shows what is still on the device.
- **Every synced record carries a `client_uuid`** and the server upserts on it.
  Rural connections retry constantly; duplicates are a data-integrity bug.
- **Checks are created by the database trigger, never by application code.** If you
  find yourself inserting into `checks`, you are working around the design.
- **Independence is derived, never entered.** See `derive_check_independence()`.
- **A missed check is not a passing check.** Exclude it from denominators.
- **Four objects only** — school, visit, work, check. Adding a fifth is how tools
  like this collapse.
- **Nothing about identifiable children.** No names, marks, or attendance. It brings
  DPDP parental-consent obligations the project does not need and cannot meet.
- **The session cookie is signed and carries a password version.** Never put a bare
  id in it — that is a cookie any client can write. `password_set_at` is the version,
  so a password change signs out the devices that were signed in before it; a new
  session-issuing path that skips it silently keeps a stolen handset logged in.
- **A generated password is temporary.** It lands with `must_change_password`, and
  `src/proxy.ts` holds that session on `/password`. Anything that mints a credential
  and leaves that flag clear is handing out a permanent password by accident.
- **A score requires site evidence, never paperwork alone.** `school_scores` returns
  NULL when no facility has been observed — a school nobody has visited renders as a
  visible gap rather than being handed a number derived from a grant PDF.
- **Never assert a state you do not have evidence for.** An absent value renders as an
  honest empty state, not as the worst-case branch of a ternary.
- **Findings and scores are VIEWS, not stored columns**, so they cannot drift from the
  evidence. The score's components are displayed on the school page — if you change the
  weights, change that panel too.

## Conventions

- Money is stored in **paise** as `bigint`, formatted with `rupees()` from `src/components/ui`.
- Facility and work types are **table rows, not enums** — survival curves group by
  `work_type_key`, so the taxonomy must stay stable and editable without a migration.
- Two shells: `AppShell` (sidebar + topbar) for desk work, `FieldShell` (single column,
  large targets) for the capture flow. They are deliberately different products.
- Design tokens live in `globals.css`. Flat surfaces, 1px hairlines, no drop shadows;
  hierarchy comes from font weight, not size. Cobalt is the only brand colour —
  green/amber/red stay strictly semantic so a status never competes with the brand.
- Every number wears `.num` (Geist Mono, tabular).
- All interface text is English, including field capture, sign-in, passwords, and notices.
- Storage is behind `src/lib/storage.ts`. Swap that one module for R2; nothing else
  knows where bytes live.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
