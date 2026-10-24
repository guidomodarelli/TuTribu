/** Composes an actual focal delivery worker against one current owned SQL capability and a closed HTTP boundary. @module messaging-restore-dispatch-fixture */
import { randomUUID } from "node:crypto";
import type { MessagingRestoreSql } from "./messaging-restore-composition";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { AdmissionProviderTestTransport } from "./admission-provider-transport";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionDeliveryDispatchScope } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type { MessagingDispatchRuntime } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import { buildMessagingWorkModule } from "@/src/modules/messaging/setup";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";

/**
 * Composes real claim, marker, reservation, credential, SDK and receipt owners for one original.
 * @param database - Exact owned source or restored copy, never a captured parent executor.
 * @param source - Native contributing leader and selected resource facts.
 * @param original - Actual applicant/challenge/delivery committed by the issuance owner.
 * @param readSecurityConfig - Live external recovery state and material.
 * @param transport - Closed test-owned fetch boundary; it never falls back to the network.
 * @returns Current bounded dispatch and its unpersisted safe diagnostics/deferred work.
 */
export function composeRestoreAdmissionDispatch(database: MessagingRestoreSql, source: { context: Pick<AuthorizedMessagingContext, "tribeId" | "actorUserId" | "connectionId" | "connectionVersion"> }, original: { context: { userId: string }; original: { challengeId: string; deliveryId?: string } }, readSecurityConfig: () => Promise<MessagingSecurityConfig>, transport: AdmissionProviderTestTransport) {
  if (!original.original.deliveryId) throw new Error("Messaging restore dispatch fixture failed: original_delivery_unavailable");
  const focalScope: AdmissionDeliveryDispatchScope = {
    purpose: "admission", deliveryId: original.original.deliveryId, tribeId: source.context.tribeId,
    contributingLeaderUserId: source.context.actorUserId, connectionId: source.context.connectionId,
    connectionVersion: source.context.connectionVersion, applicantUserId: original.context.userId, challengeId: original.original.challengeId,
  };
  const deferred: Promise<void>[] = [];
  const reports: Parameters<MessagingDispatchRuntime["report"]>[0][] = [];
  const worker = buildMessagingWorkModule({
    focalScope, authorize: async () => true, readSecurityConfig,
    execute: (actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run),
    createSender: (preparation) => new ZavuMessageDeliverySender(preparation, transport.fetch),
    runtime: { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: (report) => { reports.push(report); } },
  });
  return {
    /** @returns Actual confirmed counters after every explicitly retained effect settles. */
    async run() { const result = await worker.useCases.dispatch.execute(); await Promise.all(deferred); return result; },
    reports,
  };
}
