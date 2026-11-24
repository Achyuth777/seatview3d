import type { Db } from '../db';

export interface MailMessage { to: string; kind: 'verify' | 'reset'; subject: string; body: string }

/** How mail leaves the system. Only "simulated" exists today: no email provider is connected. */
export interface Mailer {
  mode: 'simulated' | 'smtp';
  send(message: MailMessage): Promise<void>;
}

/**
 * Records every message in mail_outbox and sends nothing. Development and tests read verification and
 * reset links from there. Real delivery needs an email provider (a credential), which is not configured.
 */
export class OutboxMailer implements Mailer {
  readonly mode = 'simulated' as const;
  constructor(private db: Db) {}
  async send(m: MailMessage) {
    await this.db.query(`INSERT INTO mail_outbox (to_email, kind, subject, body, status) VALUES ($1,$2,$3,$4,'simulated')`, [m.to, m.kind, m.subject, m.body]);
  }
}

/** Test addresses only, for the development outbox reader. */
export const isTestAddress = (email: string) => /@example\.(com|test)$/i.test(email);
