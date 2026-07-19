import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDependent } from '../../engine/details.service';
import { PERSONAS } from '../personas';
import { driveToQuote, setupUatEnv, type UatEnv } from '../uat-fixtures';

// WP-12 Part B — Dubai EBP (U-20..U-23)
let env: UatEnv;
beforeAll(async () => {
  env = await setupUatEnv('broker');
});
afterAll(() => env.db.close());

describe('WP-12 §B — Dubai EBP', () => {
  // rules: UW-301, UW-304, UW-308
  it('U-20 Salary AED 3,500 employee → EBP track, community-rated, STP', async () => {
    const result = await driveToQuote(env, PERSONAS.P05!);
    if (result.declined) throw new Error('setup failed');
    const track = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      tx.query<{ product_track: string }>('SELECT product_track FROM applications WHERE id = $1', [
        result.applicationId,
      ]),
    );
    expect(track.rows[0]!.product_track).toBe('dubai_ebp');
    expect(result.quote!.kind).toBe('final'); // community-rated, no medical rating
  });

  // rules: UW-301
  it('U-21 Salary AED 9,000 → enhanced track', async () => {
    const result = await driveToQuote(env, PERSONAS.P06!);
    if (result.declined) throw new Error('setup failed');
    const track = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      tx.query<{ product_track: string }>('SELECT product_track FROM applications WHERE id = $1', [
        result.applicationId,
      ]),
    );
    expect(track.rows[0]!.product_track).toBe('enhanced');
    expect(result.quote!.kind).toBe('indicative'); // enhanced quotes are indicative until UW
  });

  // rules: END-002c, REG-024
  it('U-22 Newborn addition day 25 → endorsement processed; day-20 warning fired', async () => {
    const result = await driveToQuote(env, PERSONAS.P05!);
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    const dob25 = new Date(Date.now() - 25 * 24 * 3600_000).toISOString().slice(0, 10);
    const dep = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      addDependent(tx, env.mocks.icp, {
        applicationId: result.applicationId,
        tenantId: env.tenantId,
        relationship: 'child',
        fullName: 'Newborn Ebp Child',
        passportNo: 'NP0000111',
        dob: dob25,
        gender: 'female',
        nationality: 'NP',
      }),
    );
    expect(dep.newbornNotice).toBe(true); // day-20+ warning window
  });

  // rules: UW-306
  it('U-23 Married female EBP buyer → maternity terms + waiting notice displayed', async () => {
    const result = await driveToQuote(env, PERSONAS.P07!);
    if (result.declined) throw new Error('setup failed');
    expect(result.quote!.breakdown.maternityNotice).toBe(true);
  });
});
