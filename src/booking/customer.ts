import { BookingError } from './types';

/** Contact details collected at checkout. Stored with the booking only; no emails are sent. */
export interface Customer {
  name: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** Trims/normalises and validates; throws BookingError('INVALID_CUSTOMER') listing the problems. */
export function normalizeCustomer(input: { name?: unknown; email?: unknown } | undefined): Customer {
  const name = typeof input?.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const problems: string[] = [];
  if (name.length < 1 || name.length > 100 || CONTROL_RE.test(name)) problems.push('Enter your name (1–100 characters).');
  if (email.length > 254 || !EMAIL_RE.test(email)) problems.push('Enter a valid email address.');
  if (problems.length) throw new BookingError('INVALID_CUSTOMER', problems.join(' '));
  return { name, email };
}
