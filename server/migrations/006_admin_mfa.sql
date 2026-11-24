-- Additive: TOTP second factor for admins, recorded per session.
ALTER TABLE users ADD COLUMN totp_secret text;
ALTER TABLE users ADD COLUMN totp_enabled_at timestamptz;
ALTER TABLE user_sessions ADD COLUMN mfa_verified_at timestamptz;
