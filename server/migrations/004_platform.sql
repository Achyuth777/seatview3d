-- Cinema directory, screenings, feed state, accounts, saved items and the admin audit trail.
CREATE TABLE cities (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE cinemas (
  id            text PRIMARY KEY,
  city_id       text NOT NULL REFERENCES cities(id),
  name          text NOT NULL,
  mall          text,
  neighbourhood text NOT NULL,
  provider_name text,
  provider_url  text,
  is_demo       boolean NOT NULL DEFAULT false,
  merged_into   text REFERENCES cinemas(id),
  overrides     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cinema_aliases (
  city_id    text NOT NULL REFERENCES cities(id),
  normalized text NOT NULL,
  cinema_id  text NOT NULL REFERENCES cinemas(id),
  alias      text NOT NULL,
  source     text NOT NULL DEFAULT 'directory' CHECK (source IN ('directory', 'admin')),
  removed    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (cinema_id, normalized)
);
CREATE INDEX cinema_aliases_city ON cinema_aliases (city_id, normalized);

CREATE TABLE provider_cinemas (
  provider    text NOT NULL,
  external_id text NOT NULL,
  cinema_id   text NOT NULL REFERENCES cinemas(id),
  PRIMARY KEY (provider, external_id)
);

CREATE TABLE auditoriums (
  id           text PRIMARY KEY,
  cinema_id    text NOT NULL REFERENCES cinemas(id),
  name         text NOT NULL,
  model_id     text,
  verification text CHECK (verification IN ('verified', 'illustrative')),
  note         text,
  CHECK ((model_id IS NULL) = (verification IS NULL))
);

CREATE TABLE films (
  id         text PRIMARY KEY,
  title      text NOT NULL,
  languages  jsonb NOT NULL DEFAULT '[]'::jsonb,
  genres     jsonb NOT NULL DEFAULT '[]'::jsonb,
  poster_url text
);

CREATE TABLE screenings (
  id            text PRIMARY KEY,
  source        text NOT NULL,
  cinema_id     text NOT NULL REFERENCES cinemas(id),
  film_id       text NOT NULL REFERENCES films(id),
  auditorium_id text REFERENCES auditoriums(id),
  local_start   text NOT NULL,
  local_date    text NOT NULL,
  starts_at     timestamptz NOT NULL,
  language      text,
  format        text NOT NULL,
  provider_url  text,
  is_demo       boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX screenings_lookup ON screenings (cinema_id, local_date, status);

CREATE TABLE feed_state (
  city_id         text PRIMARY KEY REFERENCES cities(id),
  provider        text,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error      text
);

CREATE TABLE feed_runs (
  id          bigserial PRIMARY KEY,
  city_id     text NOT NULL REFERENCES cities(id),
  provider    text,
  local_date  text NOT NULL,
  status      text NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  message     text,
  shows       integer NOT NULL DEFAULT 0,
  actor_email text,
  started_at  timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  home_city     text REFERENCES cities(id),
  languages     jsonb NOT NULL DEFAULT '[]'::jsonb,
  notify        jsonb NOT NULL DEFAULT '{"showChanges": true, "emailReminders": false}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
  token_hash text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE favourite_cinemas (
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cinema_id text NOT NULL REFERENCES cinemas(id),
  PRIMARY KEY (user_id, cinema_id)
);

CREATE TABLE saved_screenings (
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  screening_id     text NOT NULL,
  snapshot         jsonb NOT NULL,
  rating_dismissed boolean NOT NULL DEFAULT false,
  saved_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, screening_id)
);

CREATE TABLE seat_ratings (
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  screening_id  text NOT NULL,
  auditorium_id text NOT NULL REFERENCES auditoriums(id),
  score         smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  PRIMARY KEY (user_id, screening_id)
);

CREATE TABLE account_tickets (
  reference text PRIMARY KEY,
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_audit (
  id          bigserial PRIMARY KEY,
  actor_id    text NOT NULL,
  actor_email text NOT NULL,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text NOT NULL,
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
