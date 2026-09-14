# Security review — 13 September 2026

## Scope

This review covered the current application and Git history for:

- personal-data exposure through public pages, API responses, logs, exports, and committed files;
- SQL injection through URL parameters, form fields, JSON bodies, identifiers, and administrative scripts;
- authentication and organisation-boundary checks around operational data;
- known vulnerabilities in production and development dependencies.

## Findings and changes

### Dependency vulnerabilities — remediated

The initial audit found two critical Next.js advisories and a high-severity `sharp` advisory in the production tree. The complete tree also contained a high-severity `js-yaml` advisory through development tooling.

Next.js was upgraded from 16.3.2 to 16.3.5, which also moved `sharp` to its patched release. The transitive `js-yaml` dependency was upgraded to 4.3.2. `npm audit` now reports zero known vulnerabilities across the complete dependency tree.

### Guessable phone hashes — remediated with a compatibility path

Phone numbers were stored as plain SHA-256 digests. Because Indian mobile numbers have a limited search space, somebody with a copied database could prepare a lookup table and recover many numbers.

New hashes use HMAC-SHA256 with a separate `FR_PHONE_PEPPER` production secret. Existing SHA-256 records remain usable as migration candidates and are replaced with keyed hashes after successful sign-in, invitation activation, password administration, invitation renewal, or account locking. Production startup now refuses to run without a phone pepper of at least 32 characters.

### SQL identifier interpolation — removed

Request values were already passed as PostgreSQL parameters throughout the application. The media upload route interpolated a table and column chosen from a hard-coded allowlist. User input could not escape that allowlist, but the construction resembled an injection sink and could become unsafe during later edits.

The route now uses one static ownership query and one static insert. The validated owner kind selects a nullable foreign-key value through SQL `CASE` expressions. No request value or identifier is interpolated into executable SQL.

### Accidental child identifiers in field evidence — reduced

Public queries do not select user names, phone data, notes, transcripts, or media. Signed-in field evidence still accepts free text, voice, and photographs, so it can contain personal data if a field worker records it.

The visit and check flows now tell workers to keep people out of photographs and not record children's names or identifying details. Free-text notes are limited to 1,000 characters in both the interface and the sync API.

## Scan results

- Public surface review: no user names, phone data, notes, transcripts, account data, or media are returned.
- Signed-in route review: operational queries are authenticated and scoped by `org_id`; coordinator-only mutations also check role.
- SQL scan: no query template contains JavaScript interpolation after remediation; request data uses PostgreSQL placeholders.
- Secret scan: no credential-shaped value is tracked in the current tree or Git history. Matches in documentation are placeholders.
- Local-data scan: `.env*`, `.data/`, private keys, build output, and uploaded evidence are ignored by Git.
- Dependency scan: zero known vulnerabilities from `npm audit` after remediation.

## Remaining limitation

The application does not perform face detection, voice redaction, or text classification on field evidence. Media remains inside the signed-in workspace and is not exposed by the public board, but coordinators must still train field workers to exclude people and child identifiers. Any future media-download endpoint must authenticate the caller and verify that the media row belongs to the caller's organisation before reading storage.
