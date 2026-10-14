/** Selects queued creation and effective cancellation facts inside their original owner transaction. @module postgres-message-delivery-audit */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessageDelivery } from "../../domain/entities/message-delivery";
import { MESSAGE_DELIVERY_AUDIT_EVENT, MESSAGE_DELIVERY_STATE } from "../../constants/message-delivery";
import { ADMISSION_AUDIT_RESOURCE_TYPE } from "@/src/modules/academy-admissions/constants/admission-audit";
import { createAdmissionResourceAuditEvent } from "@/src/modules/academy-admissions/domain/entities/admission-resource-audit-event";
import { PostgresAdmissionAuditRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-audit-repository";

/** Contains only fields returned by an effective creation/cancellation statement; rows are never schema-validated. */
export type MessageDeliveryAuditRow = {
  id: string; state: MessageDelivery["state"]; version: number;
  connection_id: string; connection_version: number; channel: MessageDelivery["channel"];
};
/** Adds the actual immutable creation clock supplied by INSERT RETURNING. */
export type CreatedMessageDeliveryAuditRow = MessageDeliveryAuditRow & { created_at: Date | string };
/** Keeps an administrator command distinct from a background effect that has no durable human operation. */
type MessageDeliveryAuditScope = { tribeId: string; actorUserId: string | null; operationId: string | null };
/** Restricts cancellation to the exact closed reasons of existing local owners. */
type MessageDeliveryCancellationAuditScope = MessageDeliveryAuditScope & {
  cause: "explicit_resend" | "suspected_compromise" | "connection_replaced" | "candidate_expired";
  createdAt: Date;
};

/**
 * Records the inserted intent's actual version and clock without treating queued policy as a reservation.
 * @param database - Existing authorized issuance transaction, before its final authority checks.
 * @param scope - Actual issuing actor, tribe and internal ledger.
 * @param delivery - Selected fields from the inserted own delivery.
 * @param rule - Original fixed issuance operation verified by its owner.
 * @returns After staging the fact; the original owner controls rollback and commit.
 */
export async function appendCreatedMessageDeliveryAudit(database: RequestDatabase, scope: MessageDeliveryAuditScope, delivery: CreatedMessageDeliveryAuditRow, rule: string): Promise<void> {
  await new PostgresAdmissionAuditRepository(database).append(createAdmissionResourceAuditEvent({
    ...scope, resourceType: ADMISSION_AUDIT_RESOURCE_TYPE.delivery, resourceId: delivery.id,
    eventType: MESSAGE_DELIVERY_AUDIT_EVENT.created, resourceVersion: delivery.version,
    rule, cause: null, createdAt: new Date(delivery.created_at),
    metadata: { fromState: null, toState: delivery.state, previousVersion: null,
      connectionId: delivery.connection_id, connectionVersion: delivery.connection_version, channel: delivery.channel,
      attemptId: null, authorizedUsagePolicyVersion: null },
  }));
}

/**
 * Batches only effective queued cancellations, preserving their original channel and connection version.
 * @param database - Original protected owner transaction after its existing delivery locks.
 * @param scope - Actual current actor/ledger, owner-selected cause and shared effect clock.
 * @param deliveries - UPDATE RETURNING rows after the queued/no-attempt predicate and version+1 effect.
 * @returns After staging one batch, or no write when no delivery was changed.
 */
export async function appendCancelledMessageDeliveryAudit(database: RequestDatabase, scope: MessageDeliveryCancellationAuditScope, deliveries: readonly MessageDeliveryAuditRow[]): Promise<void> {
  await new PostgresAdmissionAuditRepository(database).appendMany(deliveries.map((delivery) => createAdmissionResourceAuditEvent({
    tribeId: scope.tribeId, actorUserId: scope.actorUserId, operationId: scope.operationId,
    resourceType: ADMISSION_AUDIT_RESOURCE_TYPE.delivery, resourceId: delivery.id,
    eventType: MESSAGE_DELIVERY_AUDIT_EVENT.cancelled, resourceVersion: delivery.version,
    rule: scope.cause, cause: scope.cause, createdAt: scope.createdAt,
    metadata: { fromState: MESSAGE_DELIVERY_STATE.queued, toState: delivery.state, previousVersion: delivery.version-1,
      connectionId: delivery.connection_id, connectionVersion: delivery.connection_version, channel: delivery.channel,
      attemptId: null, authorizedUsagePolicyVersion: null },
  })));
}
