import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { writeAudit } from './lib/audit';

/**
 * Trigger em qualquer escrita de pedido — grava audit log server-side.
 *
 * Complementa (não substitui) o audit já feito pelo painel, garantindo
 * rastro mesmo se o cliente esquecer de escrever (ou for adulterado).
 *
 * Ações registradas:
 *  - order.create
 *  - order.status.change (quando status muda)
 *  - order.cancel (quando novo status == 'cancelado')
 *  - order.delete
 *
 * Idempotência: cada invocação escreve uma entrada nova. Firestore triggers
 * podem ser reentregues em raras falhas — como o audit é append-only,
 * duplicatas ocasionais são preferíveis a lacunas.
 */
export const onOrderWrite = onDocumentWritten(
  {
    document: 'artifacts/{tenant}/public/data/orders/{orderId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const tenantId = event.params.tenant;
    const orderId = event.params.orderId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const ts = Date.now();

    if (!before && after) {
      await writeAudit(tenantId, {
        action: 'order.create',
        uid: 'system:onOrderWrite',
        ts,
        targetType: 'order',
        targetId: orderId,
        meta: {
          total: typeof after.total === 'number' ? after.total : null,
          status: typeof after.status === 'string' ? after.status : null,
          ownerUid: typeof after.ownerUid === 'string' ? after.ownerUid : null,
        },
      });
      return;
    }

    if (before && !after) {
      await writeAudit(tenantId, {
        action: 'order.delete',
        uid: 'system:onOrderWrite',
        ts,
        targetType: 'order',
        targetId: orderId,
        meta: {
          lastStatus: typeof before.status === 'string' ? before.status : null,
          total: typeof before.total === 'number' ? before.total : null,
        },
      });
      return;
    }

    if (before && after) {
      const oldStatus = typeof before.status === 'string' ? before.status : null;
      const newStatus = typeof after.status === 'string' ? after.status : null;
      if (oldStatus === newStatus) return; // update irrelevante pra auditoria
      const isCancel = newStatus === 'cancelado';
      await writeAudit(tenantId, {
        action: isCancel ? 'order.cancel' : 'order.status.change',
        uid: 'system:onOrderWrite',
        ts,
        targetType: 'order',
        targetId: orderId,
        meta: {
          from: oldStatus,
          to: newStatus,
          cancelReason: isCancel && typeof after.cancelReason === 'string' ? after.cancelReason : null,
          canceledBy: isCancel && typeof after.canceledBy === 'string' ? after.canceledBy : null,
        },
      });
      return;
    }

    logger.debug('onOrderWrite: evento sem before nem after', { tenantId, orderId });
  }
);
