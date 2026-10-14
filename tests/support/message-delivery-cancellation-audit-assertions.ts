/** Verifies actual scoped cancellation facts without inspecting source text or private payloads. @module message-delivery-cancellation-audit-assertions */
import { sql } from "drizzle-orm";
import { expect } from "vitest";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Describes the original resource version and actual post-cancellation lifecycle version. */
type CancelledDeliveryExpectation = { deliveryId: string; connectionId: string; connectionVersion: number; channel: "email" | "sms" | "whatsapp"; version: number };
/** Separates a public command key from the stored internal ledger, with explicit background absence. */
type CancellationAuditExpectation = { tribeId: string; actorUserId: string | null; operationId: string | null; cause: "explicit_resend" | "suspected_compromise" | "connection_replaced" | "candidate_expired"; deliveries: readonly CancelledDeliveryExpectation[] };

/**
 * Exercises persisted actor/ledger/effect metadata and detects duplicate facts after replay or rollback.
 * @param database - Original synthetic protected transaction on this run's owned branch.
 * @param expected - Exact current owner action and its effective cancelled deliveries.
 * @returns After comparing selected rows, including real same-tribe ledger provenance or its absence.
 */
export async function expectMessageDeliveryCancellationAudits(database: RequestDatabase, expected: CancellationAuditExpectation): Promise<void> {
  const actual = (await database.execute(sql`select event.resource_id,event.actor_user_id,operation.idempotency_key as command_key,event.operation_id is null as operation_absent,event.resource_version,event.rule,event.cause,event.metadata from public.academy_admission_audit_events event left join public.academy_admission_operations operation on operation.id=event.operation_id and operation.tribe_id=event.tribe_id where event.tribe_id=${expected.tribeId} and event.resource_type='message_delivery' and event.event_type='delivery_cancelled' and event.cause=${expected.cause} order by event.resource_id`)).rows;
  const rows = [...expected.deliveries].sort((first, second) => first.deliveryId.localeCompare(second.deliveryId)).map((delivery) => ({
    resource_id: delivery.deliveryId, actor_user_id: expected.actorUserId, command_key: expected.operationId,
    operation_absent: expected.operationId === null, resource_version: delivery.version, rule: expected.cause, cause: expected.cause,
    metadata: { fromState: "queued", toState: "cancelled", previousVersion: delivery.version-1,
      connectionId: delivery.connectionId, connectionVersion: delivery.connectionVersion, channel: delivery.channel,
      attemptId: null, authorizedUsagePolicyVersion: null },
  }));
  expect(actual).toEqual(rows);
}
