-- 003: contact details collected at checkout. Required for new real bookings; NOT VALID keeps
-- bookings made before this migration (no contact details) and the seeded mock sales legal.
ALTER TABLE bookings ADD COLUMN customer_name text;
ALTER TABLE bookings ADD COLUMN customer_email text;
ALTER TABLE bookings ADD CONSTRAINT bookings_customer_required
  CHECK (is_mock OR (customer_name IS NOT NULL AND customer_email IS NOT NULL)) NOT VALID;
