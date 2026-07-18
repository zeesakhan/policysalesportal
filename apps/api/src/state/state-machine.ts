/**
 * Guarded state-machine framework (ARCHITECTURE §2): "state machines, not
 * flags". Illegal transitions are impossible — there is no way to move between
 * states except through a declared transition whose guard passes.
 */
export class IllegalTransitionError extends Error {
  constructor(machine: string, from: string, to: string, reason?: string) {
    super(
      `Illegal transition in ${machine}: ${from} → ${to}${reason ? ` (${reason})` : ''}`,
    );
    this.name = 'IllegalTransitionError';
  }
}

export interface TransitionDef<S extends string, Ctx> {
  from: S;
  to: S;
  /** Rule IDs enforced/evidenced by this transition — flows into audit events. */
  ruleIds: string[];
  /** Throws (with a rule citation) to veto the transition. */
  guard?: (ctx: Ctx) => void;
}

export class StateMachine<S extends string, Ctx = void> {
  constructor(
    public readonly name: string,
    public readonly states: readonly S[],
    private readonly transitions: readonly TransitionDef<S, Ctx>[],
  ) {
    for (const t of transitions) {
      if (!states.includes(t.from) || !states.includes(t.to)) {
        throw new Error(`${name}: transition references unknown state ${t.from}→${t.to}`);
      }
    }
  }

  /** Returns the transition definition or throws IllegalTransitionError. */
  assertTransition(from: S, to: S, ctx: Ctx): TransitionDef<S, Ctx> {
    const def = this.transitions.find((t) => t.from === from && t.to === to);
    if (!def) throw new IllegalTransitionError(this.name, from, to);
    if (def.guard) {
      try {
        def.guard(ctx);
      } catch (err) {
        throw new IllegalTransitionError(this.name, from, to, (err as Error).message);
      }
    }
    return def;
  }

  canTransition(from: S, to: S, ctx: Ctx): boolean {
    try {
      this.assertTransition(from, to, ctx);
      return true;
    } catch {
      return false;
    }
  }
}
