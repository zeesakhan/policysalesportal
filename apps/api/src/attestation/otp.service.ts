import { createHash, randomInt, randomUUID } from 'node:crypto';
import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import type { SmsPort } from '../integrations/sms_otp/port';

/**
 * Shared OTP attestation service (ARCHITECTURE §2): consent (JB-02),
 * declaration (SC-07), review (SC-08) and counter-offer (REF-021) all attest
 * through this one service; each success stores an attestation artifact.
 */
export type AttestationPurpose = 'consent' | 'declaration' | 'review' | 'counter_offer';

export class OtpError extends Error {
  constructor(
    public readonly reason: 'expired' | 'invalid_code' | 'too_many_attempts' | 'unknown_challenge',
  ) {
    super(`OTP verification failed: ${reason}`);
    this.name = 'OtpError';
  }
}

interface Challenge {
  codeHash: string;
  phone: string;
  purpose: AttestationPurpose;
  applicationId: string;
  tenantId: string;
  expiresAt: number;
  attempts: number;
}

const hashCode = (code: string): string => createHash('sha256').update(code).digest('hex');

export class OtpAttestationService {
  private readonly challenges = new Map<string, Challenge>();

  constructor(
    private readonly sms: SmsPort,
    private readonly opts: {
      ttlMs?: number;
      maxAttempts?: number;
      now?: () => number;
    } = {},
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  async createChallenge(args: {
    tenantId: string;
    applicationId: string;
    purpose: AttestationPurpose;
    phone: string;
  }): Promise<{ challengeId: string }> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const challengeId = randomUUID();
    this.challenges.set(challengeId, {
      codeHash: hashCode(code),
      phone: args.phone,
      purpose: args.purpose,
      applicationId: args.applicationId,
      tenantId: args.tenantId,
      expiresAt: this.now() + (this.opts.ttlMs ?? 5 * 60_000),
      attempts: 0,
    });
    await this.sms.send(args.phone, `Your verification code is ${code}`);
    return { challengeId };
  }

  /**
   * Verifies the code and, on success, stores the attestation artifact and
   * audit event in the given transaction context. The stored artifact never
   * contains the code itself — only its hash.
   */
  async verify(
    exec: SqlExec,
    challengeId: string,
    code: string,
  ): Promise<{ attestationId: string }> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw new OtpError('unknown_challenge');
    if (this.now() > challenge.expiresAt) {
      this.challenges.delete(challengeId);
      throw new OtpError('expired');
    }
    challenge.attempts += 1;
    if (challenge.attempts > (this.opts.maxAttempts ?? 5)) {
      this.challenges.delete(challengeId);
      throw new OtpError('too_many_attempts');
    }
    if (hashCode(code) !== challenge.codeHash) throw new OtpError('invalid_code');

    this.challenges.delete(challengeId);
    const verifiedAt = new Date(this.now()).toISOString();
    const artifact = {
      purpose: challenge.purpose,
      phone: challenge.phone,
      method: 'sms_otp',
      codeHash: challenge.codeHash,
      verifiedAt,
    };
    const inserted = await exec.query<{ id: string }>(
      `INSERT INTO attestations (tenant_id, application_id, purpose, phone, verified_at, artifact)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        challenge.tenantId,
        challenge.applicationId,
        challenge.purpose,
        challenge.phone,
        verifiedAt,
        JSON.stringify(artifact),
      ],
    );
    const attestationId = inserted.rows[0]!.id;
    await recordAuditEvent(exec, {
      tenantId: challenge.tenantId,
      action: `attestation.verified.${challenge.purpose}`,
      entityType: 'attestation',
      entityId: attestationId,
      after: artifact,
      ruleIds: ['JB-02'],
    });
    return { attestationId };
  }
}
