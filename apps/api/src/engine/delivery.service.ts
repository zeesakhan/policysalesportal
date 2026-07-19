import { randomUUID } from 'node:crypto';
import { t, type Locale } from '@psp/shared';
import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import type { EmailPort } from '../integrations/email/port';
import type { WhatsAppPort } from '../integrations/whatsapp/port';
import { transitionApplication } from '../state/application-machine';
import { JourneyRuleError } from './entry.service';

/**
 * S10 — policy pack delivery (PAY-024): schedule, e-card, receipt, benefit
 * summary in the customer's language + Arabic where provided; WhatsApp
 * primary, email secondary; typing centres additionally print (M2-T2).
 */
export async function deliverPolicyPack(
  exec: SqlExec,
  whatsapp: WhatsAppPort,
  email: EmailPort,
  args: { applicationId: string; tenantId: string; actingUserId?: string },
): Promise<{ channels: string[] }> {
  const app = await exec.query<{ state: string; mobile: string | null; email: string | null; language: string | null }>(
    'SELECT state, mobile, email, language FROM applications WHERE id = $1',
    [args.applicationId],
  );
  if (app.rows[0]?.state !== 'registered') {
    // PAY-022: delivery only after "Active & registered" — never earlier
    throw new JourneyRuleError('PAY-022', `cannot deliver from state '${app.rows[0]?.state}'`);
  }
  const policy = await exec.query<{ policy_number: string }>(
    'SELECT policy_number FROM policies WHERE application_id = $1',
    [args.applicationId],
  );
  const policyNumber = policy.rows[0]!.policy_number;
  const locale = (app.rows[0]!.language ?? 'en') as Locale;
  const attachments = ['policy_schedule.pdf', 'e_card.pdf', 'receipt.pdf', 'benefit_summary.pdf'];

  const channels: string[] = [];
  if (app.rows[0]!.mobile) {
    await whatsapp.send(
      app.rows[0]!.mobile,
      `${t(locale, 'portal.customer.title')} — ${policyNumber}`,
      attachments,
    );
    channels.push('whatsapp');
  }
  if (app.rows[0]!.email) {
    await email.send(app.rows[0]!.email, `Policy ${policyNumber}`, 'Your policy pack is attached.', attachments);
    channels.push('email');
  }

  await transitionApplication(exec, {
    applicationId: args.applicationId,
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    from: 'registered',
    to: 'delivered',
  });
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    action: 'policy.pack_delivered',
    entityType: 'policy',
    entityId: policyNumber,
    after: { channels, locale },
    ruleIds: ['PAY-024'],
  });
  return { channels };
}

/** SC-11 — my policies: list + tracker states for a customer mobile. */
export async function myPolicies(
  exec: SqlExec,
  args: { mobile: string },
): Promise<{ policyNumber: string; status: string; applicationId: string }[]> {
  const rows = await exec.query<{ policy_number: string; status: string; application_id: string }>(
    `SELECT p.policy_number, p.status, p.application_id
     FROM policies p JOIN applications a ON a.id = p.application_id
     WHERE a.mobile = $1 ORDER BY p.created_at DESC`,
    [args.mobile],
  );
  return rows.rows.map((r) => ({
    policyNumber: r.policy_number,
    status: r.status,
    applicationId: r.application_id,
  }));
}

/**
 * SC-12 / J-R2 — save & resume: 14-day retention, resume link via WhatsApp.
 */
export async function createResumeLink(
  exec: SqlExec,
  whatsapp: WhatsAppPort,
  args: { applicationId: string; tenantId: string },
): Promise<{ token: string }> {
  const app = await exec.query<{ mobile: string | null }>(
    'SELECT mobile FROM applications WHERE id = $1',
    [args.applicationId],
  );
  const token = randomUUID();
  await exec.query(
    `UPDATE applications SET resume_token = $1, resume_expires_at = now() + interval '14 days',
       updated_at = now() WHERE id = $2`,
    [token, args.applicationId],
  );
  if (app.rows[0]?.mobile) {
    await whatsapp.send(app.rows[0].mobile, `Resume your application: https://psp.example/resume/${token}`);
  }
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    action: 'application.resume_link_created',
    entityType: 'application',
    entityId: args.applicationId,
    ruleIds: ['J-R2'],
  });
  return { token };
}

export async function resumeApplication(
  exec: SqlExec,
  token: string,
): Promise<{ applicationId: string; state: string }> {
  const rows = await exec.query<{ id: string; state: string; resume_expires_at: string }>(
    'SELECT id, state, resume_expires_at FROM applications WHERE resume_token = $1',
    [token],
  );
  if (rows.rows.length === 0) throw new JourneyRuleError('J-R2', 'unknown resume token');
  if (new Date(rows.rows[0]!.resume_expires_at).getTime() < Date.now()) {
    throw new JourneyRuleError('J-R2', 'resume link expired (14-day retention)');
  }
  return { applicationId: rows.rows[0]!.id, state: rows.rows[0]!.state };
}

/**
 * J-R2 — abandonment sweep: ONE reminder max per application; quoted
 * applications older than 3 days with no reminder yet get their single nudge.
 */
export async function sendAbandonmentReminders(
  exec: SqlExec,
  whatsapp: WhatsAppPort,
): Promise<number> {
  const due = await exec.query<{ id: string; mobile: string | null }>(
    `SELECT id, mobile FROM applications
     WHERE state = 'quoted' AND reminder_sent = false AND mobile IS NOT NULL
       AND updated_at < now() - interval '3 days'`,
  );
  for (const app of due.rows) {
    await whatsapp.send(app.mobile!, 'Your saved insurance quote is waiting — resume any time this week.');
    await exec.query(`UPDATE applications SET reminder_sent = true WHERE id = $1`, [app.id]);
  }
  return due.rows.length;
}
