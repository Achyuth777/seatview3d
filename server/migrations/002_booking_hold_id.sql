-- 002: remember which hold produced each booking, so a retried confirm can return the
-- original booking instead of "hold expired" (idempotent confirm).
ALTER TABLE bookings ADD COLUMN hold_id uuid;
CREATE UNIQUE INDEX bookings_hold_id ON bookings (hold_id) WHERE hold_id IS NOT NULL;
