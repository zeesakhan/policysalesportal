import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDbContext, type SqlExec } from '../db/client';
import { runMigrations } from '../db/migrate';
import { MockSmsAdapter } from '../integrations/sms_otp/mock';
import { OtpAttestationService, OtpError } from './otp.service';

let db: PGlite;
let tenantId: string;
let applicationId: string;

const exec: SqlExec = {
  query: async (sql, params) => {
    const res = await db.query(sql, params as unknown[]);
    return { rows: res.rows as Record<string, unknown>[] };
  },
  exec: async (sql) => {
    await db.exec(sql);
  },
};

const codeFromSms = (sms: MockSmsAdapter): string => {
  const last = sms.sent[sms.sent.length - 1]!;
  return /(\d{6})/.exec(last.message)![1]!;
};

beforeAll(async () => {
  db = new PGlite();
  await runMigrations(exec);
  await withDbContext(exec, { isPlatform: true, roleCode: 'platform_ops' }, async (tx) => {
    const t = await tx.query<{ id: string }>(
      `INSERT INTO tenants (type, name, status) VALUES ('typing_centre', 'TC', 'active') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;
  });
  await withDbContext(exec, { tenantId, roleCode: 'operator' }, async (tx) => {
    const a = await tx.query<{ id: string }>(
      `INSERT INTO applications (tenant_id, regime) VALUES ($1, 'dubai') RETURNING id`,
      [tenantId],
    );
    applicationId = a.rows[0]!.id;
  });
});

afterAll(async () => {
  await db.close();
});

describe('OTP attestation service (JB-02 / SC-07 / SC-08 / REF-021)', () => {
  it('sends a 6-digit code via the mock SMS adapter and stores an artifact on verify', async () => {
    const sms = new MockSmsAdapter();
    const svc = new OtpAttestationService(sms);
    const { challengeId } = await svc.createChallenge({
      tenantId,
      applicationId,
      purpose: 'consent',
      phone: '+9715xxxxxxx',
    });
    expect(sms.sent).toHaveLength(1);

    const { attestationId } = await withDbContext(
      exec,
      { tenantId, roleCode: 'operator' },
      (tx) => svc.verify(tx, challengeId, codeFromSms(sms)),
    );
    expect(attestationId).toBeTruthy();

    const rows = await withDbContext(exec, { tenantId, roleCode: 'operator' }, (tx) =>
      tx.query<{ purpose: string; artifact: { codeHash?: string; verifiedAt?: string } }>(
        'SELECT purpose, artifact FROM attestations WHERE id = $1',
        [attestationId],
      ),
    );
    expect(rows.rows[0]!.purpose).toBe('consent');
    expect(rows.rows[0]!.artifact.codeHash).toBeTruthy();
    expect(JSON.stringify(rows.rows[0]!.artifact)).not.toContain(codeFromSms(sms));
  });

  it('rejects a wrong code and a replayed challenge', async () => {
    const sms = new MockSmsAdapter();
    const svc = new OtpAttestationService(sms);
    const { challengeId } = await svc.createChallenge({
      tenantId,
      applicationId,
      purpose: 'review',
      phone: '+9715xxxxxxx',
    });
    await expect(
      withDbContext(exec, { tenantId, roleCode: 'operator' }, (tx) =>
        svc.verify(tx, challengeId, '000000'),
      ),
    ).rejects.toThrow(OtpError);
    // correct code still works after one wrong attempt
    await withDbContext(exec, { tenantId, roleCode: 'operator' }, (tx) =>
      svc.verify(tx, challengeId, codeFromSms(sms)),
    );
    // …but the challenge is consumed: replay fails
    await expect(
      withDbContext(exec, { tenantId, roleCode: 'operator' }, (tx) =>
        svc.verify(tx, challengeId, codeFromSms(sms)),
      ),
    ).rejects.toThrow(/unknown_challenge/);
  });

  it('limits attempts and expires challenges', async () => {
    const sms = new MockSmsAdapter();
    let now = 1_000_000;
    const svc = new OtpAttestationService(sms, { maxAttempts: 2, ttlMs: 60_000, now: () => now });

    const { challengeId } = await svc.createChallenge({
      tenantId,
      applicationId,
      purpose: 'declaration',
      phone: '+9715xxxxxxx',
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        withDbContext(exec, { tenantId, roleCode: 'operator' }, (tx) =>
          svc.verify(tx, challengeId, '000000'),
        ),
      ).rejects.toThrow(/invalid_code/);
    }
    await expect(
      withDbContext(exec, { tenantId, roleCode: 'operator' }, (tx) =>
        svc.verify(tx, challengeId, codeFromSms(sms)),
      ),
    ).rejects.toThrow(/too_many_attempts/);

    const second = await svc.createChallenge({
      tenantId,
      applicationId,
      purpose: 'declaration',
      phone: '+9715xxxxxxx',
    });
    now += 61_000;
    await expect(
      withDbContext(exec, { tenantId, roleCode: 'operator' }, (tx) =>
        svc.verify(tx, second.challengeId, codeFromSms(sms)),
      ),
    ).rejects.toThrow(/expired/);
  });

  it('attestations are append-only evidence', async () => {
    await expect(
      withDbContext(exec, { tenantId, roleCode: 'operator' }, (tx) =>
        tx.query(`UPDATE attestations SET phone = 'tampered'`),
      ),
    ).rejects.toThrow(/append-only/);
  });
});
