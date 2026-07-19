import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { OtpAttestationService, type AttestationPurpose } from '../attestation/otp.service';
import type { Db } from '../db/provider';
import { submitDeclaration, type DeclarationInput } from '../engine/declaration.service';
import { addDependent, captureDetails, type DependentInput, type DetailsInput } from '../engine/details.service';
import { acceptCounterOffer, decide, underwriterDecide } from '../engine/decision.service';
import {
  createResumeLink,
  deliverPolicyPack,
  myPolicies,
  resumeApplication,
} from '../engine/delivery.service';
import { routeRegime, startApplication, JourneyRuleError, type Channel, type VisaStatus } from '../engine/entry.service';
import { captureIdentity, type IdentityInput } from '../engine/identity.service';
import { attemptRegistration, getTracker, orchestrateIssuance, threeWayMatch } from '../engine/issuance.service';
import { expirePaymentWindows, handlePaymentWebhook, requestPayment } from '../engine/payment.service';
import { generateQuote, type QuoteOptions } from '../engine/quote.service';
import { checkEddTriggers, resolveScreeningHold, runScreening } from '../engine/screening.service';
import type { Emirate } from '../engine/regime';
import { MockEmailAdapter } from '../integrations/email/mock';
import { MockIcpAdapter } from '../integrations/icp_validation/mock';
import { MockInsurerAdapter } from '../integrations/insurer/mock';
import { MockMohreAdapter } from '../integrations/mohre/mock';
import { MockScreeningAdapter } from '../integrations/screening/mock';
import { MockSmsAdapter } from '../integrations/sms_otp/mock';
import { MockWhatsAppAdapter } from '../integrations/whatsapp/mock';
import { defaultRuleConfig } from '../rules/rule-config';
import { RulesEngine } from '../rules/rules-engine.service';
import { portalContext } from './request-context';

/**
 * The one application engine behind all five portal skins (WP-13 §1). Every
 * endpoint runs in the caller's RLS context; cross-tenant controls run in the
 * engine's system context.
 */
@Controller()
export class EngineController {
  // Mock-first adapters (CLAUDE.md §3.5). Real adapters land in M5-T1 behind flags.
  readonly icp = new MockIcpAdapter();
  readonly mohre = new MockMohreAdapter();
  readonly screening = new MockScreeningAdapter();
  readonly insurer = new MockInsurerAdapter();
  readonly sms = new MockSmsAdapter();
  readonly whatsapp = new MockWhatsAppAdapter();
  readonly email = new MockEmailAdapter();
  readonly rules = new RulesEngine(defaultRuleConfig);
  readonly otp = new OtpAttestationService(this.sms);

  constructor(private readonly db: Db) {}

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof JourneyRuleError) {
        // J-R4: customers see the category; the rule detail stays server-side
        throw new HttpException(
          { ruleId: err.ruleId, category: err.customerCategory ?? 'not_eligible', message: err.message },
          422,
        );
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------- journey
  @Post('applications')
  start(@Req() req: Request, @Body() body: { channel: Channel; language: string; affiliateCode?: string; privacyConsent: boolean }) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        startApplication(tx, {
          tenantId: ctx.tenantId!,
          actingUserId: ctx.userId,
          ...body,
        }),
      ),
    );
  }

  @Post('applications/:id/regime')
  regime(@Req() req: Request, @Param('id') id: string, @Body() body: { emirateOfVisa: Emirate; visaStatus: VisaStatus }) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        routeRegime(tx, { applicationId: id, tenantId: ctx.tenantId!, actingUserId: ctx.userId, ...body }),
      ),
    );
  }

  @Post('applications/:id/identity')
  identity(@Req() req: Request, @Param('id') id: string, @Body() body: Omit<IdentityInput, 'applicationId' | 'tenantId'>) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        captureIdentity(tx, (fn) => this.db.runSystem(fn), this.icp, this.rules, {
          ...body,
          applicationId: id,
          tenantId: ctx.tenantId!,
          actingUserId: ctx.userId,
        }),
      ),
    );
  }

  @Post('applications/:id/details')
  details(@Req() req: Request, @Param('id') id: string, @Body() body: Omit<DetailsInput, 'applicationId' | 'tenantId'>) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        captureDetails(tx, this.mohre, { ...body, applicationId: id, tenantId: ctx.tenantId!, actingUserId: ctx.userId }),
      ),
    );
  }

  @Post('applications/:id/dependents')
  dependents(@Req() req: Request, @Param('id') id: string, @Body() body: Omit<DependentInput, 'applicationId' | 'tenantId'>) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        addDependent(tx, this.icp, { ...body, applicationId: id, tenantId: ctx.tenantId!, actingUserId: ctx.userId }),
      ),
    );
  }

  @Post('applications/:id/screening')
  screen(@Req() req: Request, @Param('id') id: string) {
    const ctx = portalContext(req);
    return this.guard(async () => {
      const result = await this.db.run(ctx, (tx) =>
        runScreening(tx, (fn) => this.db.runSystem(fn), this.screening, {
          applicationId: id,
          tenantId: ctx.tenantId!,
          actingUserId: ctx.userId,
        }),
      );
      await this.db.run(ctx, (tx) =>
        checkEddTriggers(tx, (fn) => this.db.runSystem(fn), { applicationId: id, tenantId: ctx.tenantId! }),
      );
      return result;
    });
  }

  @Post('applications/:id/quote')
  quote(@Req() req: Request, @Param('id') id: string, @Body() body: { productCode: string; options?: QuoteOptions; promoCode?: string }) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        generateQuote(tx, { applicationId: id, tenantId: ctx.tenantId!, actingUserId: ctx.userId, ...body }),
      ),
    );
  }

  @Post('applications/:id/declaration')
  declaration(@Req() req: Request, @Param('id') id: string, @Body() body: Omit<DeclarationInput, 'applicationId' | 'tenantId'>) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        submitDeclaration(tx, this.rules, { ...body, applicationId: id, tenantId: ctx.tenantId!, actingUserId: ctx.userId }),
      ),
    );
  }

  @Post('applications/:id/decide')
  decideApp(@Req() req: Request, @Param('id') id: string) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) => decide(tx, this.rules, { applicationId: id, tenantId: ctx.tenantId!, actingUserId: ctx.userId })),
    );
  }

  // ------------------------------------------------------------ attestation
  @Post('applications/:id/attestations')
  createChallenge(@Req() req: Request, @Param('id') id: string, @Body() body: { purpose: AttestationPurpose; phone: string }) {
    const ctx = portalContext(req);
    return this.otp.createChallenge({ tenantId: ctx.tenantId!, applicationId: id, ...body });
  }

  @Post('attestations/verify')
  verifyChallenge(@Req() req: Request, @Body() body: { challengeId: string; code: string }) {
    const ctx = portalContext(req);
    return this.guard(() => this.db.run(ctx, (tx) => this.otp.verify(tx, body.challengeId, body.code)));
  }

  // ---------------------------------------------------------------- payment
  @Post('applications/:id/payment')
  payment(@Req() req: Request, @Param('id') id: string, @Body() body: { attestationId: string }) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        requestPayment(tx, this.insurer, this.rules, {
          applicationId: id,
          tenantId: ctx.tenantId!,
          actingUserId: ctx.userId,
          attestationId: body.attestationId,
        }),
      ),
    );
  }

  /** Insurer webhook — authenticated by shared secret in prod (M5); system context. */
  @Post('webhooks/payment')
  paymentWebhook(@Body() body: { providerRef: string; status: 'confirmed' | 'failed' }) {
    return this.db.runSystem((tx) => handlePaymentWebhook(tx, body));
  }

  @Post('applications/:id/issue')
  issue(@Req() req: Request, @Param('id') id: string) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        orchestrateIssuance(tx, this.insurer, { applicationId: id, tenantId: ctx.tenantId!, actingUserId: ctx.userId }),
      ),
    );
  }

  @Post('applications/:id/deliver')
  deliver(@Req() req: Request, @Param('id') id: string) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        deliverPolicyPack(tx, this.whatsapp, this.email, { applicationId: id, tenantId: ctx.tenantId!, actingUserId: ctx.userId }),
      ),
    );
  }

  // ----------------------------------------------------------------- reads
  @Get('applications/:id')
  application(@Req() req: Request, @Param('id') id: string) {
    const ctx = portalContext(req);
    return this.db.run(ctx, async (tx) => {
      const app = await tx.query(
        `SELECT id, state, regime, product_track, channel, language, decline_reason, cooling_referral
         FROM applications WHERE id = $1`,
        [id],
      );
      const persons = await tx.query(
        `SELECT id, kind, full_name, declaration_status, icp_status FROM persons WHERE application_id = $1`,
        [id],
      );
      const quote = await tx.query(
        `SELECT id, premium_aed, kind, breakdown, valid_until FROM quotes
         WHERE application_id = $1 AND status = 'active'`,
        [id],
      );
      const tracker = await getTracker(tx, id);
      return { application: app.rows[0], persons: persons.rows, quote: quote.rows[0], tracker };
    });
  }

  @Get('applications')
  applications(@Req() req: Request, @Query('state') state?: string) {
    const ctx = portalContext(req);
    return this.db.run(ctx, (tx) =>
      tx.query(
        `SELECT id, state, regime, product_track, channel, created_at FROM applications
         ${state ? 'WHERE state = $1' : ''} ORDER BY created_at DESC LIMIT 100`,
        state ? [state] : [],
      ),
    );
  }

  @Get('catalogue')
  catalogue(@Req() req: Request, @Query('track') track?: string) {
    const ctx = portalContext(req);
    return this.db.run(ctx, (tx) =>
      tx.query(
        `SELECT code, insurer_name, name, track, regime, declaration_required, benefits FROM products
         WHERE status = 'live' ${track ? 'AND track = $1' : ''}`,
        track ? [track] : [],
      ),
    );
  }

  @Get('policies')
  policies(@Req() req: Request, @Query('mobile') mobile: string) {
    const ctx = portalContext(req);
    return this.db.run(ctx, (tx) => myPolicies(tx, { mobile }));
  }

  // ----------------------------------------------------------- save/resume
  @Post('applications/:id/resume-link')
  resumeLink(@Req() req: Request, @Param('id') id: string) {
    const ctx = portalContext(req);
    return this.db.run(ctx, (tx) => createResumeLink(tx, this.whatsapp, { applicationId: id, tenantId: ctx.tenantId! }));
  }

  @Get('resume/:token')
  resume(@Req() req: Request, @Param('token') token: string) {
    const ctx = portalContext(req);
    return this.guard(() => this.db.run(ctx, (tx) => resumeApplication(tx, token)));
  }

  // ------------------------------------------------------------- referrals
  @Get('cases')
  cases(@Req() req: Request, @Query('queue') queue?: string) {
    const ctx = portalContext(req);
    return this.db.run(ctx, (tx) =>
      tx.query(
        `SELECT id, application_id, queue, state, decision, trigger_rule_ids, sla_due_at, snapshot, created_at
         FROM cases ${queue ? 'WHERE queue = $1' : ''} ORDER BY sla_due_at NULLS LAST LIMIT 100`,
        queue ? [queue] : [],
      ),
    );
  }

  @Post('cases/:id/decision')
  caseDecision(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { decision: 'accept' | 'accept_with_terms' | 'decline'; rationale: string; loadingPct?: number; exclusionText?: string },
  ) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        underwriterDecide(tx, (fn) => this.db.runSystem(fn), this.rules, {
          caseId: id,
          tenantId: ctx.tenantId ?? '',
          actorUserId: ctx.userId ?? 'unknown',
          ...body,
        }),
      ),
    );
  }

  @Post('cases/:id/screening-disposition')
  screeningDisposition(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { disposition: 'false_positive' | 'confirmed'; note: string },
  ) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        resolveScreeningHold(tx, { caseId: id, tenantId: ctx.tenantId ?? '', actorUserId: ctx.userId, ...body }),
      ),
    );
  }

  @Post('counter-offers/:id/accept')
  acceptOffer(@Req() req: Request, @Param('id') id: string, @Body() body: { attestationId: string }) {
    const ctx = portalContext(req);
    return this.guard(() =>
      this.db.run(ctx, (tx) =>
        acceptCounterOffer(tx, { counterOfferId: id, tenantId: ctx.tenantId!, attestationId: body.attestationId, actingUserId: ctx.userId }),
      ),
    );
  }

  // ---------------------------------------------------------------- ops/admin
  @Get('ops/tickets')
  opsTickets(@Req() req: Request) {
    const ctx = portalContext(req);
    return this.db.run(ctx, (tx) =>
      tx.query(`SELECT * FROM ops_tickets WHERE status = 'open' ORDER BY created_at LIMIT 100`),
    );
  }

  @Post('ops/tickets/:id/retry-registration')
  retryRegistration(@Req() req: Request, @Param('id') id: string) {
    const ctx = portalContext(req);
    return this.db.run(ctx, async (tx) => {
      const ticket = await tx.query<{ application_id: string; tenant_id: string; detail: { policyNumber: string } }>(
        `SELECT application_id, tenant_id, detail FROM ops_tickets WHERE id = $1`,
        [id],
      );
      if (ticket.rows.length === 0) throw new HttpException('ticket not found', 404);
      const app = await tx.query<{ regime: string }>(
        `SELECT regime FROM applications WHERE id = $1`,
        [ticket.rows[0]!.application_id],
      );
      return attemptRegistration(tx, this.insurer, {
        applicationId: ticket.rows[0]!.application_id,
        tenantId: ticket.rows[0]!.tenant_id,
        policyNumber: ticket.rows[0]!.detail.policyNumber,
        regime: app.rows[0]!.regime,
      });
    });
  }

  @Get('admin/exceptions')
  exceptions(@Req() req: Request) {
    const ctx = portalContext(req);
    return this.db.run(ctx, (tx) => threeWayMatch(tx)); // PAY-030 / AD-08
  }

  @Post('admin/payments/expire-sweep')
  expireSweep(@Req() req: Request) {
    const ctx = portalContext(req);
    return this.db.run(ctx, (tx) => expirePaymentWindows(tx));
  }

  @Post('admin/tenants')
  createTenant(@Req() req: Request, @Body() body: { type: string; name: string; status?: string }) {
    const ctx = portalContext(req);
    return this.db.run(ctx, (tx) =>
      tx.query(
        `INSERT INTO tenants (type, name, status) VALUES ($1, $2, $3) RETURNING id, type, name, status`,
        [body.type, body.name, body.status ?? 'pending'],
      ),
    );
  }

  @Post('admin/tenants/:id/status')
  tenantStatus(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }) {
    const ctx = portalContext(req);
    // TEN-011: suspension is immediate-effect (in-flight completes, no new business)
    return this.db.run(ctx, (tx) =>
      tx.query(`UPDATE tenants SET status = $1 WHERE id = $2 RETURNING id, status`, [body.status, id]),
    );
  }

  @Get('admin/audit')
  audit(@Req() req: Request, @Query('entityId') entityId: string) {
    const ctx = portalContext(req);
    // MIS-010 / AD-07: platform-only via RLS
    return this.db.run(ctx, (tx) =>
      tx.query(
        `SELECT occurred_at, tenant_id, actor_user_id, action, entity_type, entity_id, rule_ids
         FROM audit_events WHERE entity_id = $1 ORDER BY occurred_at LIMIT 200`,
        [entityId],
      ),
    );
  }

  // -------------------------------------------------------------- affiliate
  @Get('affiliate/stats')
  affiliateStats(@Req() req: Request, @Query('code') code: string) {
    // TEN-003: attribution metrics only — zero customer PII in this response
    return this.db.runSystem(async (tx) => {
      const rows = await tx.query<{ total: string; converted: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE state IN ('issued','registered','delivered'))::text AS converted
         FROM applications WHERE affiliate_code = $1`,
        [code],
      );
      void portalContext(req);
      return { code, clicks: Number(rows.rows[0]!.total), conversions: Number(rows.rows[0]!.converted) };
    });
  }
}
