import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import type { IcpValidationPort } from '../integrations/icp_validation/port';
import type { MohrePort } from '../integrations/mohre/port';
import { eidChecksumValid, normalizeEid } from './eid';
import { JourneyRuleError } from './entry.service';

export type EmploymentCategory =
  | 'private_employee'
  | 'domestic_worker'
  | 'self_sponsored'
  | 'freelancer'
  | 'dependent';
export type SalaryBand = 'lt_4k' | '4k_10k' | 'gt_10k';
export type ProductTrack = 'federal_basic' | 'dubai_ebp' | 'ad_basic' | 'enhanced';

export interface DetailsInput {
  applicationId: string;
  tenantId: string;
  actingUserId?: string;
  mobile: string;
  email?: string;
  employmentCategory: EmploymentCategory;
  sponsorType: 'employer' | 'self' | 'family';
  employerName?: string;
  sponsorName?: string;
  sponsorRelationship?: string;
  salaryBand: SalaryBand;
  occupation: string;
  emirateOfResidence?: string;
  payerName?: string;
  payerRelationship?: string;
  /** UW-402: mandatory acknowledgement when the AD sponsor-obligation notice shows. */
  sponsorNoticeAcknowledged?: boolean;
}

export interface DetailsOutcome {
  track: ProductTrack;
  /** KYC-001a: MOHRE no-record → eligibility referral (not a decline). */
  mohreReferralCaseId?: string;
  /** UW-402 notice displayed + acknowledged (AD employer-sponsored). */
  sponsorNoticeShown: boolean;
}

/**
 * SC-04 — details & sponsor context. Routes the product track:
 * federal (UW-204: scheme population = private employee / domestic worker,
 * others → regime-appropriate alternative = enhanced track),
 * Dubai (UW-301: salary ≤ AED 4,000 → EBP, above → enhanced),
 * Abu Dhabi (UW-401: within DoH band → Basic, above → enhanced; UW-402
 * sponsor-obligation notice for employer-sponsored applicants).
 * Federal scheme category is validated against MOHRE (KYC-001a), not
 * self-declaration alone.
 */
export async function captureDetails(
  exec: SqlExec,
  mohre: MohrePort,
  input: DetailsInput,
): Promise<DetailsOutcome> {
  const app = await exec.query<{ regime: string | null; state: string }>(
    'SELECT regime, state FROM applications WHERE id = $1',
    [input.applicationId],
  );
  if (app.rows.length === 0) throw new Error(`application ${input.applicationId} not found`);
  const regime = app.rows[0]!.regime;
  if (!regime) throw new JourneyRuleError('UW-103', 'regime must be routed before details capture');

  let sponsorNoticeShown = false;
  if (regime === 'abu_dhabi' && input.sponsorType === 'employer') {
    // UW-402/REG-030: employer must cover spouse + up to 3 children under 18;
    // individual purchase requires the notice + explicit acknowledgement
    sponsorNoticeShown = true;
    if (!input.sponsorNoticeAcknowledged) {
      throw new JourneyRuleError(
        'UW-402',
        'sponsor-obligation notice must be acknowledged for Abu Dhabi employer-sponsored applicants',
      );
    }
  }

  const track = resolveTrack(regime, input.employmentCategory, input.salaryBand);

  await exec.query(
    `UPDATE applications SET
       mobile = $1, email = $2, employment_category = $3, sponsor_type = $4,
       employer_name = $5, sponsor_name = $6, sponsor_relationship = $7,
       salary_band = $8, occupation = $9, emirate_of_residence = $10,
       payer_name = $11, payer_relationship = $12, product_track = $13, updated_at = now()
     WHERE id = $14`,
    [
      input.mobile,
      input.email ?? null,
      input.employmentCategory,
      input.sponsorType,
      input.employerName ?? null,
      input.sponsorName ?? null,
      input.sponsorRelationship ?? null,
      input.salaryBand,
      input.occupation,
      input.emirateOfResidence ?? null,
      input.payerName ?? null,
      input.payerRelationship ?? null,
      track,
      input.applicationId,
    ],
  );

  let mohreReferralCaseId: string | undefined;
  if (
    regime === 'federal' &&
    (input.employmentCategory === 'private_employee' || input.employmentCategory === 'domestic_worker')
  ) {
    const applicant = await exec.query<{ id: string; eid: string | null; passport_no: string | null }>(
      `SELECT id, eid, passport_no FROM persons WHERE application_id = $1 AND kind = 'applicant'`,
      [input.applicationId],
    );
    const person = applicant.rows[0];
    const check = await mohre.checkWorkPermit({
      eid: person?.eid ?? undefined,
      passportNo: person?.passport_no ?? undefined,
      category: input.employmentCategory,
    });
    if (person) {
      await exec.query(`UPDATE persons SET mohre_status = $1 WHERE id = $2`, [
        check.result,
        person.id,
      ]);
    }
    if (check.result === 'no_record') {
      // KYC-001a: no-record → eligibility REFER (data-lag cases exist — never
      // an automatic decline). Routed to the underwriting queue: scheme
      // population eligibility is the insurer's call, not a screening matter.
      const c = await exec.query<{ id: string }>(
        `INSERT INTO cases (tenant_id, application_id, queue, trigger_rule_ids)
         VALUES ($1, $2, 'underwriting', '{KYC-001a,UW-204}') RETURNING id`,
        [input.tenantId, input.applicationId],
      );
      mohreReferralCaseId = c.rows[0]!.id;
    }
  }

  await recordAuditEvent(exec, {
    tenantId: input.tenantId,
    actorUserId: input.actingUserId,
    action: 'application.details_captured',
    entityType: 'application',
    entityId: input.applicationId,
    after: { track, sponsorNoticeShown, mohreReferred: Boolean(mohreReferralCaseId) },
    ruleIds: sponsorNoticeShown
      ? ['UW-204', 'UW-301', 'UW-401', 'UW-402']
      : ['UW-204', 'UW-301', 'UW-401'],
  });

  return { track, mohreReferralCaseId, sponsorNoticeShown };
}

function resolveTrack(
  regime: string,
  category: EmploymentCategory,
  salaryBand: SalaryBand,
): ProductTrack {
  if (regime === 'federal') {
    // UW-204: scheme population only; others get the regime-appropriate
    // alternative — the enhanced track
    return category === 'private_employee' || category === 'domestic_worker'
      ? 'federal_basic'
      : 'enhanced';
  }
  if (regime === 'dubai') {
    // UW-301: DHA lower-salary band (≤ AED 4,000 [VERIFY current banding —
    // config UW_301_SALARY_BAND_THRESHOLD_AED]) → EBP; above → enhanced
    return salaryBand === 'lt_4k' ? 'dubai_ebp' : 'enhanced';
  }
  // UW-401: DoH banding [VERIFY — same config register entry]; within band → Basic
  return salaryBand === 'lt_4k' ? 'ad_basic' : 'enhanced';
}

export interface DependentInput {
  applicationId: string;
  tenantId: string;
  actingUserId?: string;
  relationship: 'spouse' | 'child' | 'parent' | 'other';
  fullName: string;
  eid?: string;
  passportNo?: string;
  dob: string;
  gender: string;
  nationality: string;
}

export interface DependentOutcome {
  personId: string;
  /** REG-024: Dubai newborns must be insured within 30 days of birth. */
  newbornNotice: boolean;
}

/**
 * SC-05 — dependents. Each dependent is a separate insured life run through
 * the same identity controls (UW-307/UW-404): EID checksum, ICP validation,
 * per-life screening (fires with runScreening). Abu Dhabi sponsored-children
 * category requires child < 18 (UW-404).
 */
export async function addDependent(
  exec: SqlExec,
  icp: IcpValidationPort,
  input: DependentInput,
): Promise<DependentOutcome> {
  const app = await exec.query<{ regime: string | null }>(
    'SELECT regime FROM applications WHERE id = $1',
    [input.applicationId],
  );
  const regime = app.rows[0]?.regime;

  const ageYears = (Date.now() - new Date(input.dob).getTime()) / (365.25 * 24 * 3600_000);
  if (regime === 'abu_dhabi' && input.relationship === 'child' && ageYears >= 18) {
    throw new JourneyRuleError(
      'UW-404',
      'Abu Dhabi sponsored-children category requires the child to be under 18',
      'eligibility',
    );
  }

  let eid: string | null = null;
  let icpStatus = 'not_checked';
  if (input.eid) {
    eid = normalizeEid(input.eid);
    if (!eidChecksumValid(eid)) {
      throw new JourneyRuleError('UW-102', 'dependent Emirates ID failed validation', 'identity');
    }
    icpStatus = (
      await icp.validate({
        eid,
        fullName: input.fullName,
        dob: input.dob,
        nationality: input.nationality,
      })
    ).result;
  } else if (!input.passportNo) {
    throw new JourneyRuleError('KYC-002', 'dependent requires EID or passport');
  }

  const person = await exec.query<{ id: string }>(
    `INSERT INTO persons (tenant_id, application_id, kind, relationship, full_name, eid, passport_no,
                          dob, gender, nationality, icp_status, icp_checked_at)
     VALUES ($1, $2, 'dependent', $3, $4, $5, $6, $7, $8, $9, $10,
             CASE WHEN $10 = 'not_checked' THEN NULL ELSE now() END)
     RETURNING id`,
    [
      input.tenantId,
      input.applicationId,
      input.relationship,
      input.fullName,
      eid,
      input.passportNo ?? null,
      input.dob,
      input.gender,
      input.nationality,
      icpStatus,
    ],
  );

  // REG-024: newborn (≤ 30 days old) in Dubai — 30-day insurance deadline notice
  const newbornNotice = regime === 'dubai' && ageYears * 365.25 <= 30;

  await recordAuditEvent(exec, {
    tenantId: input.tenantId,
    actorUserId: input.actingUserId,
    action: 'application.dependent_added',
    entityType: 'person',
    entityId: person.rows[0]!.id,
    after: { relationship: input.relationship, icpStatus, newbornNotice },
    ruleIds: newbornNotice ? ['UW-307', 'REG-024'] : regime === 'abu_dhabi' ? ['UW-404'] : ['UW-307'],
  });

  return { personId: person.rows[0]!.id, newbornNotice };
}
