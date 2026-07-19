import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERSONAS } from '../personas';
import { driveToQuote, setupUatEnv, startAndRoute, type UatEnv } from '../uat-fixtures';

// WP-12 Part B — Eligibility & routing (U-01..U-06)
let env: UatEnv;
beforeAll(async () => {
  env = await setupUatEnv('broker');
});
afterAll(() => env.db.close());

describe('WP-12 §B — Eligibility & routing', () => {
  // rules: UW-103
  it('U-01 Sharjah-resident with Dubai visa buys → routed to Dubai products', async () => {
    const { routed } = await startAndRoute(env, PERSONAS.P05!);
    expect(routed).toEqual({ regime: 'dubai', declined: false });
  });

  // rules: UW-101, J-R4
  it('U-02 Visit-visa applicant → declined, category "visa status"', async () => {
    const { routed } = await startAndRoute(env, PERSONAS.P20!);
    expect(routed.declined).toBe(true);
    expect(routed.customerCategory).toBe('visa_status'); // J-R4: category only
  });

  // rules: UW-102
  it('U-03 Invalid EID checksum → blocked', async () => {
    const p21 = PERSONAS.P21!;
    const bad = p21.eid!.slice(0, 14) + ((Number(p21.eid!.slice(-1)) + 5) % 10);
    const result = await driveToQuote(env, p21, { eidOverride: bad });
    expect(result.declined).toBe(true);
  });

  // rules: UW-102, KYC-002, END-002a
  it('U-04 New arrival, passport+entry permit, no EID → proceeds; EID endorsement task created', async () => {
    const { applicationId, routed } = await startAndRoute(env, PERSONAS.P22!);
    expect(routed.declined).toBe(false);
    const { captureIdentity } = await import('../../engine/identity.service');
    const outcome = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      captureIdentity(tx, env.db.asPlatform, env.mocks.icp, env.rules, {
        applicationId,
        tenantId: env.tenantId,
        passportNo: 'NP9988776',
        visaFileNo: '201/2026/9988776',
        fullName: PERSONAS.P22!.fullName,
        dob: PERSONAS.P22!.dob,
        gender: PERSONAS.P22!.gender,
        nationality: PERSONAS.P22!.nationality,
      }),
    );
    expect(outcome.outcome).toBe('ok');
    const ticket = await env.db.asPlatform((tx) =>
      tx.query('SELECT id FROM ops_tickets WHERE application_id = $1 AND type = $2', [
        applicationId,
        'eid_endorsement_due',
      ]),
    );
    expect(ticket.rows).toHaveLength(1);
  });

  // rules: UW-105
  it('U-05 Duplicate purchase same EID same regime → blocked, routed to endorsement/replacement', async () => {
    const p23 = PERSONAS.P23!;
    const first = await driveToQuote(env, p23);
    if (first.declined) throw new Error('setup failure: first application declined');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      tx.query(
        `INSERT INTO policies (tenant_id, application_id, policy_number, status, issued_at)
         VALUES ($1, $2, 'POL-UAT-U05', 'registered', now())`,
        [env.tenantId, first.applicationId],
      ),
    );
    const { applicationId: secondApp } = await startAndRoute(env, p23);
    const { captureIdentity } = await import('../../engine/identity.service');
    await expect(
      env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
        captureIdentity(tx, env.db.asPlatform, env.mocks.icp, env.rules, {
          applicationId: secondApp,
          tenantId: env.tenantId,
          eid: p23.eid,
          fullName: p23.fullName,
          dob: p23.dob,
          gender: p23.gender,
          nationality: p23.nationality,
        }),
      ),
    ).rejects.toThrow(/UW-105/);
  });

  // rules: UW-107
  it('U-06 Backdated start date attempt → hard block', async () => {
    const { applicationMachine } = await import('../../state/application-machine');
    expect(() =>
      applicationMachine.assertTransition('paid', 'issued', {
        policyStartDate: new Date(Date.now() - 3 * 24 * 3600_000),
      }),
    ).toThrow(/UW-107/);
  });
});
