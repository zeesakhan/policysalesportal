import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { DbContext } from '../db/client';

const PLATFORM_ROLES = new Set([
  'super_admin',
  'platform_ops',
  'compliance_officer',
  'platform_finance',
  'support',
]);

export interface PortalContext extends DbContext {
  tenantId?: string;
  roleCode: string;
  userId?: string;
}

/**
 * Mock authentication for dev/uat (real IdP + MFA is M5-T2): the portal
 * passes x-tenant-id / x-role / x-user-id headers; RLS enforces the rest at
 * the data layer, so a forged role still cannot cross tenant boundaries
 * beyond what WP-09 grants that role.
 */
export function portalContext(req: Request): PortalContext {
  const roleCode = (req.headers['x-role'] as string) ?? '';
  if (!roleCode) throw new BadRequestException('x-role header required');
  const tenantId = (req.headers['x-tenant-id'] as string) || undefined;
  const userId = (req.headers['x-user-id'] as string) || undefined;
  return {
    tenantId,
    roleCode,
    userId,
    isPlatform: PLATFORM_ROLES.has(roleCode),
  };
}
