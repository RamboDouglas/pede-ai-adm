import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

export type Role = 'owner' | 'manager' | 'cashier';

export const ROLES: readonly Role[] = ['owner', 'manager', 'cashier'] as const;

export interface CallerContext {
  uid: string;
  email: string | undefined;
  tenantId: string;
  role: Role;
}

export function requireCaller(req: CallableRequest<unknown>): CallerContext {
  const auth = req.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Login obrigatório.');
  }
  const token = auth.token as Record<string, unknown>;
  const tenantId = typeof token.tenantId === 'string' ? token.tenantId : '';
  const role = typeof token.role === 'string' ? (token.role as Role) : ('' as Role);
  if (!tenantId || !ROLES.includes(role)) {
    throw new HttpsError(
      'permission-denied',
      'Usuário sem tenantId/role válidos. Peça ao owner para configurar seus claims.'
    );
  }
  return {
    uid: auth.uid,
    email: typeof token.email === 'string' ? token.email : undefined,
    tenantId,
    role,
  };
}

export function requireOwner(req: CallableRequest<unknown>): CallerContext {
  const c = requireCaller(req);
  if (c.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Apenas o owner pode executar esta operação.');
  }
  return c;
}

export function requireManager(req: CallableRequest<unknown>): CallerContext {
  const c = requireCaller(req);
  if (c.role !== 'owner' && c.role !== 'manager') {
    throw new HttpsError('permission-denied', 'Apenas owner ou manager podem executar esta operação.');
  }
  return c;
}
