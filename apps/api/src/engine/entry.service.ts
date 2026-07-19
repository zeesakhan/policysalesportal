import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import { transitionApplication } from '../state/application-machine';
import { EMIRATES, regimeForEmirate, type Emirate, type Regime } from './regime';

export type Channel = 'direct' | 'typing_centre' | 'broker' | 'affiliate';
export type VisaStatus = 'active' | 'in_process' | 'visit';

export class JourneyRuleError extends Error {
  constructor(
    public readonly ruleId: string,
    message: string,
    /** J-R4: the only thing a customer ever sees is the category. */
    public readonly customerCategory?: string,
  ) {
    super(`${ruleId}: ${message}`);
    this.name = 'JourneyRuleError';
  }
}

/**
 * SC-01 — entry, attribution, language, privacy consent (REG-050). Consent is
 * a hard gate: no application record exists without a timestamped consent.
 */
export async function startApplication(
  exec: SqlExec,
  args: {
    tenantId: string;
    actingUserId?: string;
    channel: Channel;
    language: string;
    affiliateCode?: string;
    privacyConsent: boolean;
  },
): Promise<{ applicationId: string }> {
  if (!args.privacyConsent) {
    throw new JourneyRuleError('REG-050', 'privacy consent is required to start an application');
  }
  // TEN-011: suspension is immediate-effect — no new business through a
  // suspended tenant; in-flight applications (already started) are unaffected
  const tenant = await exec.query<{ status: string }>('SELECT status FROM tenants WHERE id = $1', [
    args.tenantId,
  ]);
  if (tenant.rows[0]?.status === 'suspended') {
    throw new JourneyRuleError('TEN-011', 'tenant is suspended — no new business permitted');
  }
  const inserted = await exec.query<{ id: string }>(
    `INSERT INTO applications (tenant_id, acting_user_id, channel, language, affiliate_code, consent_at)
     VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
    [args.tenantId, args.actingUserId ?? null, args.channel, args.language, args.affiliateCode ?? null],
  );
  const applicationId = inserted.rows[0]!.id;
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    action: 'application.started',
    entityType: 'application',
    entityId: applicationId,
    after: { channel: args.channel, language: args.language, affiliateCode: args.affiliateCode },
    ruleIds: args.affiliateCode ? ['REG-050', 'QR-023'] : ['REG-050'],
  });
  return { applicationId };
}

/**
 * SC-02 — regime routing. UW-103 sets the regime from the emirate of visa
 * issuance; UW-101 blocks visit/tourist visas for mandatory products
 * (DECLINE, category: visa status — J-R4 category only).
 */
export async function routeRegime(
  exec: SqlExec,
  args: {
    applicationId: string;
    tenantId: string;
    actingUserId?: string;
    emirateOfVisa: Emirate;
    visaStatus: VisaStatus;
  },
): Promise<{ regime: Regime | null; declined: boolean; customerCategory?: string }> {
  if (!EMIRATES.includes(args.emirateOfVisa)) {
    throw new JourneyRuleError('UW-103', `unknown emirate: ${args.emirateOfVisa}`);
  }

  if (args.visaStatus === 'visit') {
    // UW-101: visit/tourist visa → not eligible for mandatory-scheme products
    await exec.query(
      `UPDATE applications SET emirate_of_visa = $1, visa_status = $2, decline_reason = 'visa_status',
         updated_at = now() WHERE id = $3`,
      [args.emirateOfVisa, args.visaStatus, args.applicationId],
    );
    await transitionApplication(exec, {
      applicationId: args.applicationId,
      tenantId: args.tenantId,
      actorUserId: args.actingUserId,
      from: 'draft',
      to: 'declined',
    });
    return { regime: null, declined: true, customerCategory: 'visa_status' };
  }

  const regime = regimeForEmirate(args.emirateOfVisa);
  await exec.query(
    `UPDATE applications SET emirate_of_visa = $1, visa_status = $2, regime = $3, updated_at = now()
     WHERE id = $4`,
    [args.emirateOfVisa, args.visaStatus, regime, args.applicationId],
  );
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    action: 'application.regime_routed',
    entityType: 'application',
    entityId: args.applicationId,
    after: { emirateOfVisa: args.emirateOfVisa, visaStatus: args.visaStatus, regime },
    ruleIds: ['UW-103'],
  });
  return { regime, declined: false };
}
