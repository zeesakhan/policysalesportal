// GATE-1 demo (M1-T11): drives the real engine end-to-end on mocks for all
// three regulatory regimes and prints every stage. Run: `pnpm demo`.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { withDbContext, type DbContext, type SqlExec } from '../db/client';
import { runMigrations } from '../db/migrate';
import { seedDemoCatalogue } from '../db/seed-demo';
import { deliverPolicyPack } from '../engine/delivery.service';
import { getTracker, orchestrateIssuance } from '../engine/issuance.service';
import { handlePaymentWebhook, requestPayment } from '../engine/payment.service';
import { decide, underwriterDecide } from '../engine/decision.service';
import { submitDeclaration } from '../engine/declaration.service';
import { MockEmailAdapter } from '../integrations/email/mock';
import { MockWhatsAppAdapter } from '../integrations/whatsapp/mock';
import {
  attest,
  buildQuotedApp,
  buildToPaymentPending,
  makeMocks,
  testRules,
} from '../testing/journey-fixtures';
import type { TestDb } from '../testing/test-db';

async function makeDemoDb(): Promise<TestDb> {
  const db = new PGlite();
  const exec: SqlExec = {
    query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => {
      const res = await db.query(sql, params);
      return { rows: res.rows as R[] };
    },
    exec: async (sql) => {
      await db.exec(sql);
    },
  };
  await runMigrations(exec);
  const asPlatform = <T>(fn: (tx: SqlExec) => Promise<T>) =>
    withDbContext(exec, { isPlatform: true, roleCode: 'platform_ops' }, fn);
  return {
    exec,
    close: () => db.close(),
    asPlatform,
    as: (ctx: DbContext, fn) => withDbContext(exec, ctx, fn),
    createTenant: async (type, name) => {
      const r = await asPlatform((tx) =>
        tx.query<{ id: string }>(
          `INSERT INTO tenants (type, name, status) VALUES ($1, $2, 'active') RETURNING id`,
          [type, name],
        ),
      );
      return r.rows[0]!.id;
    },
  };
}

const REGIMES = [
  { emirate: 'sharjah', label: 'Federal Basic Scheme (Northern Emirates visa)', product: 'FED-BASIC' },
  { emirate: 'dubai', label: 'Dubai EBP (DHA)', product: 'DXB-EBP' },
  { emirate: 'abu_dhabi', label: 'Abu Dhabi Basic Plan (DoH)', product: 'AD-BASIC' },
] as const;

async function main(): Promise<void> {
  console.log('=== UAE Policy Sales Portal — GATE-1 engine demo (mocks) ===\n');
  const db = await makeDemoDb();
  await db.asPlatform((tx) => seedDemoCatalogue(tx));
  const tenantId = await db.createTenant('typing_centre', 'Demo Typing Centre');
  const rules = testRules();
  const mocks = makeMocks();
  const whatsapp = new MockWhatsAppAdapter();
  const email = new MockEmailAdapter();

  for (const { emirate, label, product } of REGIMES) {
    console.log(`--- ${label} ---`);
    const { applicationId } = await buildToPaymentPending(db, tenantId, rules, mocks, {
      emirate,
      product,
      roleCode: 'operator',
    });
    const quote = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      tx.query<{ premium_aed: string; kind: string }>(
        `SELECT premium_aed, kind FROM quotes WHERE application_id = $1 AND status = 'active'`,
        [applicationId],
      ),
    );
    console.log(`  quote: AED ${quote.rows[0]!.premium_aed} (${quote.rows[0]!.kind}, incl. VAT)`);
    const attestationId = await attest(db, tenantId, applicationId, 'review', mocks);
    console.log('  review attested via OTP (UW-108)');
    const link = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      requestPayment(tx, mocks.insurer, rules, { applicationId, tenantId, attestationId }),
    );
    console.log(`  payment link (insurer rails, PAY-001): ${link.url.slice(0, 60)}…`);
    await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
    );
    const issued = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      orchestrateIssuance(tx, mocks.insurer, { applicationId, tenantId }),
    );
    await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      deliverPolicyPack(tx, whatsapp, email, { applicationId, tenantId }),
    );
    const tracker = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      getTracker(tx, applicationId),
    );
    console.log(
      `  policy ${issued.policyNumber} — Paid ✓  Issued ✓  Active & registered (visa-ready) ${tracker.visaReady ? '✓' : '✗'}`,
    );
    console.log(`  pack delivered via WhatsApp (${whatsapp.sent.length} messages so far)\n`);
  }

  // Enhanced plan: declaration → REFER → underwriter counter-offer path
  console.log('--- Enhanced plan with declared condition (REFER → counter-offer) ---');
  const enhanced = await buildQuotedApp(db, tenantId, rules, mocks, {
    emirate: 'dubai',
    salaryBand: 'gt_10k',
    product: 'ENH-SILVER',
    roleCode: 'operator',
  });
  await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
    submitDeclaration(tx, rules, {
      applicationId: enhanced.applicationId,
      tenantId,
      personId: enhanced.personId,
      answers: { D1: true, D2: false, D3: false, D4: false, D5: false, D6: false, D7: false, D8: false },
      details: [{ question: 'D1', condition: 'spinal_surgery_2019' }],
      maf: { fullHistory: 'provided' },
      sensitiveConsent: true,
    }),
  );
  const decision = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
    decide(tx, rules, { applicationId: enhanced.applicationId, tenantId }),
  );
  console.log(`  decision: ${decision.outcome.toUpperCase()} (rules: ${decision.ruleIds.join(', ')})`);
  const uw = await db.as({ roleCode: 'underwriter' }, (tx) =>
    underwriterDecide(tx, db.asPlatform, rules, {
      caseId: decision.caseId!,
      tenantId,
      actorUserId: randomUUID(),
      decision: 'accept_with_terms',
      rationale: 'loading for surgical history',
      loadingPct: 25,
    }),
  );
  console.log(`  underwriter: accept-with-terms → counter-offer ${uw.counterOfferId} (25% loading, 7-day validity)`);
  console.log('\n=== demo complete — all three regimes STP + referral flow exercised ===');
  await db.close();
}

void main();
