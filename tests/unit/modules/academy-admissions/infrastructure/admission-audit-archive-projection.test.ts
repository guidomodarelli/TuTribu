/** @vitest-environment node */
/** Exercises private SQL metadata contracts against actual owner-generated facts and request-role denial. @module admission-audit-archive-projection-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { createAdmissionResourceAuditEvent, type AdmissionResourceAuditInput } from "@/src/modules/academy-admissions/domain/entities/admission-resource-audit-event";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native private audit archive projection", () => {
  it("should preserve every newly archived owner contract and recovery lineage without private extras or public execution", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const common = { tribeId: randomUUID(), actorUserId: null, operationId: null, resourceId: randomUUID(), resourceVersion: 2, rule: null, cause: null, createdAt: new Date() };
      const inputs: AdmissionResourceAuditInput[] = [
        { ...common, resourceType: "admission_request", eventType: "pending_created", metadata: { fromStatus: null, toStatus: "pending", previousVersion: null, policyVersion: 2, verificationEpoch: 1, proofId: null, decisionId: null, invitationId: null } },
        { ...common, resourceType: "allowlist_entry", eventType: "create_allowlist_entry", metadata: { fromStatus: null, toStatus: "enabled", previousVersion: null, importId: null, contactType: "email" } },
        { ...common, resourceType: "personal_invitation", eventType: "create_personal_invitation", metadata: { fromStatus: null, toStatus: "active", previousVersion: null, requestId: null, fromAuthorizationRevoked: null, toAuthorizationRevoked: false } },
        { ...common, resourceType: "messaging_usage_policy", eventType: "update_messaging_usage", metadata: { previousVersion: 1, allowedCountries: ["AR"], verificationDailyLimit: 7, notificationDailyLimit: 2 } },
        { ...common, resourceType: "messaging_connection", eventType: "configure_messaging_connection", metadata: { fromState: "draft", toState: "ready", previousVersion: 1, configurationVersion: 2, previousConfigurationVersion: 1, channel: "email" } },
        { ...common, resourceType: "authorized_exposure", eventType: "authorized_resource_exposure", metadata: { surface: "metrics", itemCount: 1, resourceKind: "aggregate" } },
        { ...common, resourceType: "messaging_protection", eventType: "protection_keys_rotated", metadata: { purpose: "credential", previousKeyId: "synthetic-old", activeKeyId: "synthetic-new", securityEpoch: "synthetic-epoch" } },
        { ...common, resourceType: "membership", eventType: "membership_admitted", metadata: { membershipInstanceId: randomUUID(), fromRole: null, toRole: "tribemate", fromStatus: null, toStatus: "active", requestId: null, decisionId: null } },
        { ...common, resourceType: "admission_proof", eventType: "proof_created", metadata: { fromState: null, toState: "available", challengeId: randomUUID(), requestId: null, verificationEpoch: 1, channel: "email" } },
      ];
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        for (const input of inputs) {
          const event = createAdmissionResourceAuditEvent(input), payload = { ...event.metadata, apiKey: "synthetic-private-marker", contact: "hidden@example.test", providerBody: { ciphertext: "synthetic-private-marker" } };
          expect((await transaction.execute<{ metadata: unknown }>(sql`select public.project_retired_admission_owner_metadata(${event.resourceType},${event.eventType},${JSON.stringify(payload)}::jsonb) as metadata`)).rows).toEqual([{ metadata: event.metadata }]);
        }
        const lineage = { originalDeliveryId: randomUUID(), targetConnectionId: randomUUID(), originalConnectionId: randomUUID(), originalConnectionVersion: 1, originalFromState: "unknown", originalToState: "unknown", previousOriginalVersion: 2, originalVersion: 3, originalAttemptId: randomUUID(), originalAuthorizedUsagePolicyVersion: 1 };
        expect((await transaction.execute<{ metadata: unknown }>(sql`select public.project_retired_admission_owner_metadata('message_delivery','notification_delivery_recovered',${JSON.stringify({ ...lineage, apiKey: "synthetic-private-marker" })}::jsonb) as metadata`)).rows).toEqual([{ metadata: lineage }]);
        expect((await transaction.execute(sql`select public.project_retired_admission_owner_cause('connection_disconnected') as known,public.project_retired_admission_owner_cause('synthetic-private-marker') as unknown`)).rows).toEqual([{ known: "connection_disconnected", unknown: null }]);
      });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select public.project_retired_admission_owner_metadata('messaging_connection','configure_messaging_connection','{}'::jsonb)`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
