-- 001: initial schema (Phase 5). Uses IF NOT EXISTS so it also baselines databases created
-- before versioned migrations existed.

CREATE TABLE IF NOT EXISTS bookings (
  reference   text PRIMARY KEY,
  event_id    text        NOT NULL,
  total_minor integer     NOT NULL CHECK (total_minor >= 0),
  currency    char(3)     NOT NULL,
  created_at  timestamptz NOT NULL,
  is_mock     boolean     NOT NULL DEFAULT false   -- seeded "already sold" seats
);

CREATE TABLE IF NOT EXISTS holds (
  id         uuid        PRIMARY KEY,
  event_id   text        NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS holds_expires_at ON holds (expires_at);

-- One row per taken seat. The primary key is what makes double-booking impossible:
-- a seat can be claimed by exactly one hold OR one booking, never both, never twice.
CREATE TABLE IF NOT EXISTS seat_claims (
  event_id    text NOT NULL,
  seat_id     text NOT NULL,
  hold_id     uuid REFERENCES holds (id) ON DELETE CASCADE,
  booking_ref text REFERENCES bookings (reference),
  PRIMARY KEY (event_id, seat_id),
  CHECK ((hold_id IS NULL) <> (booking_ref IS NULL))
);
CREATE INDEX IF NOT EXISTS seat_claims_hold_id ON seat_claims (hold_id);
