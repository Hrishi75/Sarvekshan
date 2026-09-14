-- Invite-only account activation. A coordinator registers the phone number and
-- gives the person a one-time code; the person chooses their own password once.
-- The code is hashed, expires, and has its own attempt limit so it never becomes
-- a second long-lived credential.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS invitation_code_hash text,
  ADD COLUMN IF NOT EXISTS invitation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS invitation_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invitation_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

UPDATE users
   SET activated_at = COALESCE(password_set_at, created_at)
 WHERE password_hash IS NOT NULL AND activated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_invitation_code_hash_idx
  ON users (invitation_code_hash) WHERE invitation_code_hash IS NOT NULL;
