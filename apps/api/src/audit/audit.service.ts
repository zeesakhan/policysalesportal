import { createHash } from 'node:crypto';
import type { SqlExec } from '../db/client';

/**
 * Audit spine (J-R1, ARCHITECTURE §2): every engine step appends an event —
 * who, tenant, action, entity, before/after hash, rule IDs. The table is
 * append-only (trigger + no UPDATE/DELETE policy); reads are platform-only.
 */
export interface AuditEventInput {
  tenantId?: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ruleIds?: string[];
  details?: Record<string, unknown>;
}

/** Deterministic hash of an entity snapshot (key-sorted JSON, sha256). */
export function hashSnapshot(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function recordAuditEvent(exec: SqlExec, event: AuditEventInput): Promise<void> {
  await exec.query(
    `INSERT INTO audit_events
       (tenant_id, actor_user_id, action, entity_type, entity_id, before_hash, after_hash, rule_ids, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      event.tenantId ?? null,
      event.actorUserId ?? null,
      event.action,
      event.entityType,
      event.entityId ?? null,
      hashSnapshot(event.before),
      hashSnapshot(event.after),
      event.ruleIds ?? [],
      event.details ? JSON.stringify(event.details) : null,
    ],
  );
}
