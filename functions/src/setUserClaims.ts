import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { auth } from './lib/admin';
import { requireOwner, ROLES, type Role } from './lib/authz';
import { writeAudit } from './lib/audit';

interface SetUserClaimsData {
  email?: string;
  role?: Role;
  /**
   * Se true, remove tenantId+role do usuário (revoga acesso).
   * Ignora o campo `role`.
   */
  revoke?: boolean;
}

/**
 * Owner do tenant define (ou revoga) tenantId+role de outro usuário pelo email.
 *
 * - Só owner pode chamar.
 * - Owner NÃO pode revogar a si mesmo (previne lockout).
 * - Owner só define usuários do PRÓPRIO tenant — o tenantId vem do claim do caller,
 *   nunca do payload. Isso evita cross-tenant elevation por confused-deputy.
 * - Revoga refresh tokens no fim pra forçar re-login com claim atualizado.
 */
export const setUserClaims = onCall<SetUserClaimsData>(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (req) => {
    const caller = requireOwner(req);

    const email = (req.data?.email ?? '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'Email inválido.');
    }

    const revoke = req.data?.revoke === true;
    const role = req.data?.role;

    if (!revoke) {
      if (!role || !ROLES.includes(role)) {
        throw new HttpsError(
          'invalid-argument',
          `role obrigatório e deve ser um de: ${ROLES.join(', ')}.`
        );
      }
    }

    let target;
    try {
      target = await auth.getUserByEmail(email);
    } catch {
      throw new HttpsError('not-found', `Usuário não encontrado no Firebase Auth: ${email}`);
    }

    if (target.uid === caller.uid && (revoke || role !== 'owner')) {
      throw new HttpsError(
        'failed-precondition',
        'Você não pode remover seu próprio papel de owner (lockout).'
      );
    }

    const existing = (target.customClaims ?? {}) as Record<string, unknown>;
    if (
      typeof existing.tenantId === 'string' &&
      existing.tenantId &&
      existing.tenantId !== caller.tenantId
    ) {
      throw new HttpsError(
        'permission-denied',
        'Este usuário pertence a outro tenant. Peça ao owner de origem para revogar antes.'
      );
    }

    const newClaims = revoke ? {} : { tenantId: caller.tenantId, role };

    await auth.setCustomUserClaims(target.uid, newClaims);
    await auth.revokeRefreshTokens(target.uid);

    await writeAudit(caller.tenantId, {
      action: revoke ? 'user.claims.revoke' : 'user.claims.set',
      uid: `system:setUserClaims:${caller.uid}`,
      ts: Date.now(),
      targetType: 'user',
      targetId: target.uid,
      meta: {
        callerEmail: caller.email ?? null,
        targetEmail: email,
        newRole: revoke ? null : role,
      },
    });

    logger.info('claims atualizados', {
      caller: caller.email,
      target: email,
      role: revoke ? null : role,
    });

    return {
      ok: true,
      uid: target.uid,
      email,
      tenantId: revoke ? null : caller.tenantId,
      role: revoke ? null : role,
    };
  }
);
