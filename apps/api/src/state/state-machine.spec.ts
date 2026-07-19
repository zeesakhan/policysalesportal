import { describe, expect, it } from 'vitest';
import {
  applicationMachine,
  caseMachine,
  type ApplicationState,
} from './application-machine';
import { IllegalTransitionError } from './state-machine';

const tomorrow = new Date(Date.now() + 24 * 3600_000);
const yesterday = new Date(Date.now() - 24 * 3600_000);

describe('application state machine (ARCHITECTURE §2 / J-R1)', () => {
  it('accepts the full straight-through journey in order', () => {
    const chain: ApplicationState[] = [
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
    ];
    for (let i = 0; i < chain.length - 1; i++) {
      expect(
        applicationMachine.canTransition(chain[i]!, chain[i + 1]!, {
          policyStartDate: tomorrow,
        }),
      ).toBe(true);
    }
  });

  it('makes illegal jumps impossible, not just unlikely', () => {
    expect(() => applicationMachine.assertTransition('draft', 'issued', {})).toThrow(
      IllegalTransitionError,
    );
    // issued requires paid: no other state can reach issued
    for (const from of ['draft', 'screened', 'quoted', 'declared', 'uw_decided', 'payment_pending'] as const) {
      expect(applicationMachine.canTransition(from, 'issued', { policyStartDate: tomorrow })).toBe(
        false,
      );
    }
    // registered requires issued
    expect(applicationMachine.canTransition('paid', 'registered', {})).toBe(false);
    // no going backwards
    expect(applicationMachine.canTransition('paid', 'quoted', {})).toBe(false);
  });

  it('UW-107: forbids backdated policy start at the issuance transition guard', () => {
    expect(() =>
      applicationMachine.assertTransition('paid', 'issued', { policyStartDate: yesterday }),
    ).toThrow(/UW-107/);
    expect(() =>
      applicationMachine.assertTransition('paid', 'issued', {}),
    ).toThrow(/UW-107/);
    expect(
      applicationMachine.canTransition('paid', 'issued', { policyStartDate: tomorrow }),
    ).toBe(true);
  });

  it('decline is reachable only from uw_decided (REF-023)', () => {
    expect(applicationMachine.canTransition('uw_decided', 'declined', {})).toBe(true);
    expect(applicationMachine.canTransition('quoted', 'declined', {})).toBe(false);
    expect(applicationMachine.canTransition('paid', 'declined', {})).toBe(false);
  });
});

describe('case state machine (REF-003)', () => {
  it('follows Created → In review → Info requested → In review → Decision → Closed', () => {
    expect(caseMachine.canTransition('created', 'in_review', {})).toBe(true);
    expect(caseMachine.canTransition('in_review', 'info_requested', {})).toBe(true);
    expect(caseMachine.canTransition('info_requested', 'in_review', {})).toBe(true);
    expect(caseMachine.canTransition('in_review', 'decided', { decision: 'accept' })).toBe(true);
    expect(caseMachine.canTransition('decided', 'closed', {})).toBe(true);
  });

  it('a decision value is mandatory to decide (REF-024)', () => {
    expect(() => caseMachine.assertTransition('in_review', 'decided', {})).toThrow(/REF-024/);
  });

  it('cannot close without a decision or skip review', () => {
    expect(caseMachine.canTransition('created', 'closed', {})).toBe(false);
    expect(caseMachine.canTransition('created', 'decided', { decision: 'accept' })).toBe(false);
  });
});
