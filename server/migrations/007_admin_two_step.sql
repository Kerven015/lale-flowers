-- Two-step login for the admin panel: after the password, a 6-digit code
-- from an app on the admin's phone (Google Authenticator or similar).
ALTER TABLE admins ADD COLUMN totp_secret text;     -- set = two-step login is on
ALTER TABLE admins ADD COLUMN totp_pending text;    -- while it is being set up, until the first right code
ALTER TABLE admins ADD COLUMN totp_last_step bigint; -- each code works only once

-- One-time backup codes (for a lost phone). Only a hash is stored.
CREATE TABLE admin_backup_codes (
  id        serial      PRIMARY KEY,
  admin_id  integer     NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  code_hash text        NOT NULL,
  used_at   timestamptz
);
CREATE INDEX admin_backup_codes_admin_idx ON admin_backup_codes (admin_id);
