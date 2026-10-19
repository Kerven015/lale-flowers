-- Sign in with Google (and blocked accounts).

-- Accounts made with Google have no password until the customer sets one.
ALTER TABLE customers ALTER COLUMN password_hash DROP NOT NULL;

-- When the customer proved they own the email (signing in with Google does).
-- Changing the email in the profile clears it again.
ALTER TABLE customers ADD COLUMN email_verified_at timestamptz;

-- Set by the admin: a blocked customer cannot sign in at all.
ALTER TABLE customers ADD COLUMN blocked_at timestamptz;

-- Site language when the account was created (tm, ru, tr).
ALTER TABLE customers ADD COLUMN lang text NOT NULL DEFAULT 'tm';

-- Outside sign-in accounts linked to a customer. subject = Google's permanent
-- account id ("sub"), so the customer is found even after they change their
-- Gmail address. email = the address Google last told us (for information).
CREATE TABLE user_identities (
  provider     text        NOT NULL,
  subject      text        NOT NULL,
  user_id      integer     NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  email        text        NOT NULL DEFAULT '',
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX user_identities_user_idx ON user_identities (user_id);
