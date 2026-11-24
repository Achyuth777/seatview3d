-- Additive only: provider links and layout verification become their own records; feed expiry,
-- email verification, password reset, a mail outbox and saved-show alerts are added.
CREATE TABLE provider_links (
  id          bigserial PRIMARY KEY,
  cinema_id   text NOT NULL REFERENCES cinemas(id),
  provider    text NOT NULL,
  kind        text NOT NULL DEFAULT 'showtimes',
  url         text NOT NULL,
  source      text NOT NULL DEFAULT 'directory' CHECK (source IN ('directory', 'admin')),
  verified_at timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cinema_id, provider, kind)
);

INSERT INTO provider_links (cinema_id, provider, url, source, verified_at)
SELECT id, provider_name, COALESCE(overrides->>'providerUrl', provider_url),
       CASE WHEN overrides ? 'providerUrl' THEN 'admin' ELSE 'directory' END, now()
FROM cinemas
WHERE provider_name IS NOT NULL AND COALESCE(overrides->>'providerUrl', provider_url) IS NOT NULL;

CREATE TABLE layout_verifications (
  id            bigserial PRIMARY KEY,
  auditorium_id text NOT NULL REFERENCES auditoriums(id),
  status        text NOT NULL CHECK (status IN ('verified', 'revoked')),
  source        text NOT NULL,
  measured_on   date,
  verified_by   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX layout_verifications_auditorium ON layout_verifications (auditorium_id, id);

ALTER TABLE screenings ADD COLUMN fetched_at timestamptz;
ALTER TABLE feed_state ADD COLUMN last_failure_at timestamptz;
ALTER TABLE feed_state ADD COLUMN expires_at timestamptz;

ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

CREATE TABLE auth_tokens (
  token_hash text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

CREATE TABLE mail_outbox (
  id         bigserial PRIMARY KEY,
  to_email   text NOT NULL,
  kind       text NOT NULL,
  subject    text NOT NULL,
  body       text NOT NULL,
  status     text NOT NULL CHECK (status IN ('simulated', 'sent', 'failed')),
  error      text,
  attempts   integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id           bigserial PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  screening_id text NOT NULL,
  cinema_id    text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('changed', 'removed')),
  old_start    text NOT NULL,
  new_start    text,
  fingerprint  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (user_id, screening_id, fingerprint)
);
