import { cache } from 'react';

/**
 * Server-side client for the one application engine (WP-13 §1). Each portal
 * shell calls the same API with its own role context (mock auth until M5-T2;
 * RLS still enforces tenant boundaries data-side).
 */
const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export interface ApiCtx {
  role: string;
  tenantId?: string;
  userId?: string;
}

export async function api<T = unknown>(
  path: string,
  ctx: ApiCtx,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      'x-role': ctx.role,
      ...(ctx.tenantId ? { 'x-tenant-id': ctx.tenantId } : {}),
      ...(ctx.userId ? { 'x-user-id': ctx.userId } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.category ?? 'error', data?.message ?? res.statusText);
  }
  return data as T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly category: string,
    message: string,
  ) {
    super(message);
  }
}

interface TenantRow {
  id: string;
  type: string;
  name: string;
  status: string;
}

/** Find-or-create the demo tenant for a portal shell (dev/uat only). */
export const demoTenant = cache(async (type: string): Promise<string> => {
  const name = `Demo ${type}`;
  const existing = await api<{ rows: TenantRow[] }>(`/admin/tenants?type=${type}`, {
    role: 'platform_ops',
  });
  const found = existing.rows.find((t) => t.name === name);
  if (found) return found.id;
  const created = await api<{ rows: TenantRow[] }>('/admin/tenants', { role: 'platform_ops' }, {
    body: { type, name, status: 'active' },
  });
  return created.rows[0]!.id;
});
