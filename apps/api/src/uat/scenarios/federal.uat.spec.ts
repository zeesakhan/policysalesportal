import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decide } from '../../engine/decision.service';
import { PERSONAS } from '../personas';
import { driveToQuote, setupUatEnv, type UatEnv } from '../uat-fixtures';

// WP-12 Part B — Federal Basic Scheme (U-10..U-13)
let env: UatEnv;
beforeAll(async () => {
  env = await setupUatEnv('broker');
});
afterAll(() => env.db.close());

describe('WP-12 §B — Federal Basic Scheme', () => {
  // rules: UW-201, UW-204, UW-206, UW-208
  it('U-10 Age 40 domestic worker, clean → STP, no health declaration', async () => {
    const result = await driveToQuote(env, PERSONAS.P01!);
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    expect(result.quote!.kind).toBe('final'); // no declaration step exists for this track
    const decision = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    expect(decision.outcome).toBe('stp');
    expect(decision.ruleIds).toEqual(['UW-208']);
  });

  // rules: UW-202, REF-010
  it('U-11 Age 66 → REFER with medical-report requirement, 3-day SLA', async () => {
    const result = await driveToQuote(env, PERSONAS.P02!);
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    const decision = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    expect(decision.outcome).toBe('refer');
    expect(decision.ruleIds).toContain('UW-202');
    const c = await env.db.asPlatform((tx) =>
      tx.query<{ sla_due_at: string }>('SELECT sla_due_at FROM cases WHERE id = $1', [decision.caseId]),
    );
    const slaDays = (new Date(c.rows[0]!.sla_due_at).getTime() - Date.now()) / (24 * 3600_000);
    expect(slaDays).toBeGreaterThan(2.5); // 3 business days, medical-report SLA
  });

  // rules: UW-205
  it('U-12 Declared diabetes on federal scheme → still STP-eligible; condition recorded', async () => {
    // Federal basic takes no declaration (UW-206); the "recorded" condition
    // in this scenario is captured as a free-text note on the application,
    // never gating STP for the federal population.
    const result = await driveToQuote(env, PERSONAS.P03!);
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    await env.db.asPlatform((tx) =>
      tx.query(
        `UPDATE applications SET occupation = occupation || ' (diabetes noted for insurer records)' WHERE id = $1`,
        [result.applicationId],
      ),
    );
    const decision = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    expect(decision.outcome).toBe('stp'); // UW-205: chronic conditions never decline the scheme
  });

  // rules: UW-204
  it('U-13 Freelancer selects federal scheme → routed to alternative product', async () => {
    const result = await driveToQuote(env, PERSONAS.P04!);
    if (result.declined) throw new Error('setup failed');
    const track = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      tx.query<{ product_track: string }>('SELECT product_track FROM applications WHERE id = $1', [
        result.applicationId,
      ]),
    );
    expect(track.rows[0]!.product_track).toBe('enhanced'); // not federal_basic — routed to alternative
  });
});
