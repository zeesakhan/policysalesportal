import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import { StateMachine } from './state-machine';

/** Application journey states (ARCHITECTURE §2 / J-R1). */
export const APPLICATION_STATES = [
  'draft',
  'screened',
  'quoted',
  'declared',
  'uw_decided',
  'payment_pending',
  'paid',
  'issued',
  'registered',
  'delivered',
  'declined',
] as const;

export type ApplicationState = (typeof APPLICATION_STATES)[number];

export interface ApplicationTransitionCtx {
  /** Policy start date for issuance — UW-107 forbids backdating. */
  policyStartDate?: Date;
  now?: Date;
}

function forbidBackdating(ctx: ApplicationTransitionCtx): void {
  if (!ctx.policyStartDate) throw new Error('UW-107: policy start date required for issuance');
  const now = ctx.now ?? new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (ctx.policyStartDate < startOfToday) {
    throw new Error('UW-107: policy start date must not be backdated');
  }
}

/**
 * The only legal paths through the journey. `issued` is reachable solely from
 * `paid`, `registered` solely from `issued` — the sequencing constraints of
 * ARCHITECTURE §2 hold by construction.
 */
export const applicationMachine = new StateMachine<ApplicationState, ApplicationTransitionCtx>(
  'application',
  APPLICATION_STATES,
  [
    { from: 'draft', to: 'screened', ruleIds: ['KYC-001', 'KYC-011'] },
    { from: 'screened', to: 'quoted', ruleIds: ['QR-001'] },
    { from: 'quoted', to: 'declared', ruleIds: ['UW-501'] },
    { from: 'declared', to: 'uw_decided', ruleIds: ['UW-500'] },
    { from: 'uw_decided', to: 'payment_pending', ruleIds: ['PAY-003'] },
    { from: 'uw_decided', to: 'declined', ruleIds: ['REF-023'] },
    { from: 'payment_pending', to: 'paid', ruleIds: ['PAY-003'] },
    { from: 'paid', to: 'issued', ruleIds: ['PAY-020', 'UW-107'], guard: forbidBackdating },
    { from: 'issued', to: 'registered', ruleIds: ['PAY-022'] },
    { from: 'registered', to: 'delivered', ruleIds: ['PAY-023'] },
  ],
);

/** Case states (REF-003); "info requested" pauses the SLA clock (handled by SLA service later). */
export const CASE_STATES = ['created', 'in_review', 'info_requested', 'decided', 'closed'] as const;
export type CaseState = (typeof CASE_STATES)[number];

export interface CaseTransitionCtx {
  decision?: 'accept' | 'accept_with_terms' | 'decline';
}

export const caseMachine = new StateMachine<CaseState, CaseTransitionCtx>('case', CASE_STATES, [
  { from: 'created', to: 'in_review', ruleIds: ['REF-003'] },
  { from: 'in_review', to: 'info_requested', ruleIds: ['REF-003'] },
  { from: 'info_requested', to: 'in_review', ruleIds: ['REF-003'] },
  {
    from: 'in_review',
    to: 'decided',
    ruleIds: ['REF-003', 'REF-024'],
    guard: (ctx) => {
      if (!ctx.decision) throw new Error('REF-024: a decision value is required');
    },
  },
  { from: 'decided', to: 'closed', ruleIds: ['REF-003'] },
]);

/**
 * Persists an application state transition: asserts legality, updates the row
 * (optimistic — the WHERE clause re-checks the from-state), and appends the
 * audit event with the transition's rule IDs (J-R1).
 */
export async function transitionApplication(
  exec: SqlExec,
  args: {
    applicationId: string;
    tenantId: string;
    actorUserId?: string;
    from: ApplicationState;
    to: ApplicationState;
    ctx?: ApplicationTransitionCtx;
  },
): Promise<void> {
  const def = applicationMachine.assertTransition(args.from, args.to, args.ctx ?? {});
  const updated = await exec.query<{ id: string }>(
    `UPDATE applications SET state = $1, updated_at = now()
     WHERE id = $2 AND state = $3 RETURNING id`,
    [args.to, args.applicationId, args.from],
  );
  if (updated.rows.length === 0) {
    throw new Error(
      `application ${args.applicationId} is not in state '${args.from}' (concurrent change?)`,
    );
  }
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actorUserId,
    action: `application.transition.${args.from}->${args.to}`,
    entityType: 'application',
    entityId: args.applicationId,
    before: { state: args.from },
    after: { state: args.to },
    ruleIds: def.ruleIds,
  });
}
