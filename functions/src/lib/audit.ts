import { logger } from 'firebase-functions/v2';
import { db } from './admin';

export interface AuditEntry {
  action: string;
  uid: string;
  ts: number;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Grava uma entrada append-only no audit log privado do tenant.
 * Best-effort — se falhar, loga mas não quebra o fluxo do trigger.
 */
export async function writeAudit(tenantId: string, entry: AuditEntry): Promise<void> {
  if (!tenantId) {
    logger.warn('writeAudit chamado sem tenantId', { entry });
    return;
  }
  try {
    await db
      .collection('artifacts')
      .doc(tenantId)
      .collection('private')
      .doc('audit')
      .collection('log')
      .add(entry);
  } catch (err) {
    logger.error('Falha ao gravar audit log', { tenantId, entry, err });
  }
}
