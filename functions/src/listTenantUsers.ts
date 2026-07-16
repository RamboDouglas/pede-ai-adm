import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { auth } from './lib/admin';
import { requireManager, type Role } from './lib/authz';

interface ListTenantUsersData {
  /** Cursor de paginação (nextPageToken devolvido pelo Firebase Auth). */
  pageToken?: string;
  /** Máx por página (default 100, teto 1000 — limite do listUsers). */
  pageSize?: number;
}

interface TenantUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  role: Role;
  createdAt: string | null;
  lastSignInAt: string | null;
}

/**
 * Lista usuários do tenant do caller (owner/manager).
 *
 * Firebase Auth não indexa por customClaim, então listamos tudo e filtramos.
 * Aceitável até algumas dezenas de milhares de usuários; se crescer,
 * migrar pra tabela espelho em Firestore atualizada por trigger.
 */
export const listTenantUsers = onCall<ListTenantUsersData>(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (req) => {
    const caller = requireManager(req);

    const pageSize = Math.min(Math.max(req.data?.pageSize ?? 100, 1), 1000);
    const pageToken = req.data?.pageToken;

    let result;
    try {
      result = await auth.listUsers(pageSize, pageToken);
    } catch (err) {
      throw new HttpsError('internal', `Falha ao listar usuários: ${(err as Error).message}`);
    }

    const users: TenantUser[] = [];
    for (const u of result.users) {
      const claims = (u.customClaims ?? {}) as Record<string, unknown>;
      if (claims.tenantId !== caller.tenantId) continue;
      const role = typeof claims.role === 'string' ? (claims.role as Role) : null;
      if (!role) continue;
      users.push({
        uid: u.uid,
        email: u.email ?? null,
        displayName: u.displayName ?? null,
        disabled: u.disabled,
        role,
        createdAt: u.metadata.creationTime ?? null,
        lastSignInAt: u.metadata.lastSignInTime ?? null,
      });
    }

    return {
      users,
      nextPageToken: result.pageToken ?? null,
      // dica pro cliente: se veio nextPageToken mas nenhum user no tenant,
      // ainda vale chamar de novo — a filtragem é local.
      scanned: result.users.length,
    };
  }
);
