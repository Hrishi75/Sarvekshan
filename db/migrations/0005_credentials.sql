-- Credentials. The dev sign-in trusted a posted user id with no secret of any
-- kind, which is a full authentication bypass anywhere but a laptop. A password
-- gives a deployment something only the user knows.
--
-- Phone stays the identifier: it is what a field worker already knows, it is
-- already the unique key on users, and it is what phone OTP will use when it
-- replaces this. Only the hash is stored, as before — the password is an interim
-- credential and nothing downstream of SessionUser changes when OTP lands.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash        text,
  -- doubles as the session version: every issued cookie carries the value this
  -- had when it was signed, so changing a password logs the old sessions out
  ADD COLUMN IF NOT EXISTS password_set_at      timestamptz,
  -- a temp password is a delivery mechanism, not a credential to keep
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  -- online guessing is the attack a shared field phone actually faces
  ADD COLUMN IF NOT EXISTS failed_attempts      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until         timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at        timestamptz;

-- Sign-in looks a user up by phone alone, before any org is known. The unique
-- constraint on users is (org_id, phone_hash), which cannot serve that lookup.
CREATE INDEX IF NOT EXISTS users_phone_hash_idx ON users (phone_hash) WHERE active;
