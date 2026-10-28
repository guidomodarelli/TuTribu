/** @vitest-environment node */
/** Exercises real issuance/ledger/crypto and invalidating resend without a provider request. @module contact-verification-issuer-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { createContactVerificationWriter } from "@/tests/support/contact-verification-database-fixture";
import { PostgresAdmissionVerificationProofWriter } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-verification-proof-writer";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_PROOF_OPERATION } from "@/src/modules/academy-admissions/constants/admission-proof";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { prepareContactVerificationIssuer as prepareIssuer, recoverTestVerificationCode as recoverTestCode, advanceVerificationRequestCooldown as finishRequestCooldown } from "@/tests/support/contact-verification-issuance-fixture";
import { expectAdmissionProofInvalidationAudits } from "@/tests/support/admission-proof-invalidation-audit-assertions";
import { expectMessageDeliveryCancellationAudits } from "@/tests/support/message-delivery-cancellation-audit-assertions";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("contact verification issuance", () => {
  it("should issue one protected code and immutable delivery, recover the ledger result and consume it through the real validator", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareIssuer(database);
      const operationId = randomUUID();
      const first = await fixture.issue(null, operationId);
      if (first.state !== "completed" || first.result.outcome !== "issued") throw new Error("Synthetic initial issuance did not complete");
      expect(await fixture.issue(null, operationId)).toEqual({ ...first, replayed: true });
      const createdDeliveryId = first.result.deliveryId;
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select event.actor_user_id,event.operation_id=delivery.idempotency_key as internal_ledger,operation.idempotency_key as command_key,event.resource_version,event.metadata,event.created_at=delivery.created_at as owner_clock from public.academy_admission_audit_events event join public.message_deliveries delivery on delivery.id=event.resource_id and delivery.tribe_id=event.tribe_id join public.academy_admission_operations operation on operation.id=event.operation_id and operation.tribe_id=event.tribe_id where event.resource_id=${createdDeliveryId} and event.event_type='delivery_created'`)).rows).toEqual([{ actor_user_id: fixture.userId, internal_ledger: true, command_key: operationId, resource_version: 1, owner_clock: true, metadata: { fromState: null, toState: "queued", previousVersion: null, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", attemptId: null, authorizedUsagePolicyVersion: null } }]);
      });
      const { code, context } = await recoverTestCode(database, fixture, first.result.challengeId);
      expect(code).toMatch(/^\d{6}$/);
      expect(context.expiresAt.getTime()-context.createdAt.getTime()).toBe(600_000);
      const verified = await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as total from public.messaging_usage_events where event_type='code_request' and operation_id in(select id from public.academy_admission_operations where idempotency_key=${operationId})`)).rows).toEqual([{ total: 1 }]);
        const delivery = (await transaction.execute<{ state: string; frozen_intent: Record<string, unknown>; payload_fingerprint: Uint8Array; payload_mac_key_id: string }>(sql`select state,frozen_intent,payload_fingerprint,payload_mac_key_id from public.message_deliveries where id=${first.result.outcome === "issued" ? first.result.deliveryId : null}`)).rows[0];
        expect(delivery.state).toBe("queued");
        expect(delivery.frozen_intent).toMatchObject({ challengeId: first.result.outcome === "issued" ? first.result.challengeId : null, senderId: "synthetic-email-sender" });
        expect(Object.keys(delivery.frozen_intent).sort()).toEqual(["channel","challengeId","deliveryId","envelopeId","format","purpose","senderId","templateId","templateLanguage"].sort());
        expect(delivery.payload_fingerprint.byteLength).toBe(32);
        return createContactVerificationWriter(transaction, fixture).validate({ scope: fixture.scope, challengeId: context.challengeId, operationId: randomUUID(), code });
      });
      if (verified.outcome !== "verified" || !verified.proofId) throw new Error("Synthetic issued code did not produce an admission proof");
      const proofId = verified.proofId, requestId = randomUUID(), attachId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) values (${requestId},${fixture.scope.tribeId},${fixture.userId},'common','none',statement_timestamp(),statement_timestamp()+interval '30 days')`));
      const attachSchema = z.union([z.strictObject({ outcome: z.literal("applied"), requestId: z.uuid(), requestVersion: z.int().positive(), status: z.literal("pending"), proofId: z.uuid() }), z.strictObject({ outcome: z.literal("denied"), code: z.enum(Object.values(ADMISSION_ERROR_CODE)) })]);
      expect(await fixture.ledger.run({ actorUserId: fixture.userId, tribeId: fixture.scope.tribeId, operationType: ADMISSION_PROOF_OPERATION, idempotencyKey: attachId, intent: { requestId, proofId, expectedRequestVersion: 1 } }, attachSchema, (transaction, ledgerId) => new PostgresAdmissionVerificationProofWriter(transaction, async () => true, async () => fixture.config).applyToPending({ scope: fixture.scope, requestId, proofId, expectedRequestVersion: 1, operationId: attachId, ledgerId }))).toMatchObject({ state: "completed", result: { outcome: "applied", requestVersion: 2 } });
      await finishRequestCooldown(database, fixture);
      // Client identity may repeat in another operation type; private accounting/delivery identities remain isolated.
      expect(await fixture.issue(context.challengeId, operationId)).toMatchObject({ state: "completed", result: { outcome: "issued" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,applied_request_id,invalidated_at from public.academy_admission_verification_proofs where id=${proofId}`)).rows).toEqual([{ status: "applied", applied_request_id: requestId, invalidated_at: null }]);
        expect((await transaction.execute(sql`select status,version,proof_id from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "pending", version: 2, proof_id: proofId }]);
        expect((await transaction.execute(sql`select state from public.message_deliveries where id=${first.result.outcome === "issued" ? first.result.deliveryId : null}`)).rows).toEqual([{ state: "cancelled" }]);
        expect((await transaction.execute(sql`select operation_type from public.academy_admission_operations where idempotency_key=${operationId} order by operation_type`)).rows).toEqual([{ operation_type: "issue_contact_challenge" }, { operation_type: "resend_contact_challenge" }]);
        expect((await transaction.execute(sql`select count(distinct idempotency_key)::integer as total from public.message_deliveries where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([{ total: 2 }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.message_deliveries delivery inner join public.academy_admission_operations operation on operation.id=delivery.idempotency_key where delivery.tribe_id=${fixture.scope.tribeId} and operation.idempotency_key=${operationId}`)).rows).toEqual([{ total: 2 }]);
        await expectAdmissionProofInvalidationAudits(transaction, { tribeId: fixture.scope.tribeId, actorUserId: fixture.userId, operationId, cause: "explicit_resend", proofs: [] });
        await expectMessageDeliveryCancellationAudits(transaction, { tribeId: fixture.scope.tribeId, actorUserId: fixture.userId, operationId, cause: "explicit_resend", deliveries: [{ deliveryId: createdDeliveryId, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", version: 2 }] });
      });
    });
  }, 180_000);

  it("should replace a current challenge once, invalidate an unused proof and preserve external attempt identity and quota", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareIssuer(database);
      await database.applyMigration("20261005092500_guard_messaging_attempts.sql");
      const first = await fixture.issue();
      if (first.state !== "completed" || first.result.outcome !== "issued") throw new Error("Synthetic issuance did not complete");
      const original = first.result;
      const lease = randomUUID();
      const attemptId = await database.withContext(fixture.own, async (transaction) => {
        const claimed = (await transaction.execute<{ delivery_id: string; delivery_version: number }>(sql`select * from public.claim_messaging_deliveries(${lease},1,90)`)).rows[0];
        expect(claimed.delivery_id).toBe(original.deliveryId);
        const marker = (await transaction.execute<{ outcome: string; attempt_id: string }>(sql`select * from public.authorize_messaging_delivery_attempt(${original.deliveryId},${lease},${claimed.delivery_version},${fixture.config.environment},${fixture.config.securityEpoch})`)).rows[0];
        expect(marker.outcome).toBe("authorized");
        return marker.attempt_id;
      });
      const { code } = await recoverTestCode(database, fixture, original.challengeId);
      const proof = await database.withContext(fixture.own, async (transaction) => {
        const writer = createContactVerificationWriter(transaction, fixture);
        const wrongCode = `${code[0] === "0" ? "1" : "0"}${code.slice(1)}`;
        expect(await writer.validate({ scope: fixture.scope, challengeId: original.challengeId, operationId: randomUUID(), code: wrongCode })).toMatchObject({ outcome: "wrong_code" });
        return writer.validate({ scope: fixture.scope, challengeId: original.challengeId, operationId: randomUUID(), code });
      });
      expect(proof).toMatchObject({ outcome: "verified" });
      expect(await fixture.issue(original.challengeId)).toMatchObject({ state: "completed", result: { outcome: "denied", code: "usage_limit_reached" } });
      await finishRequestCooldown(database, fixture);
      let arrived = 0;
      let release!: () => void;
      const bothSharedLocks = new Promise<void>((complete) => { release = complete; });
      const synchronizeSharedLocks = async () => { arrived += 1; if (arrived === 2) release(); await bothSharedLocks; };
      const competingOperationIds = [randomUUID(), randomUUID()];
      const competitors = await Promise.all(competingOperationIds.map((operationId) => fixture.issue(original.challengeId, operationId, async () => fixture.config, synchronizeSharedLocks)));
      expect(competitors.filter((operation) => operation.state === "completed" && operation.result.outcome === "issued")).toHaveLength(1);
      if (proof.outcome !== "verified" || !proof.proofId) throw new Error("Expected the original available proof");
      const winning = competitors.find((operation) => operation.state === "completed" && operation.result.outcome === "issued");
      if (winning?.state !== "completed") throw new Error("Expected one committed resend");
      const proofId = proof.proofId;
      const verificationEpoch = fixture.scope.verificationEpoch;
      if (verificationEpoch === null) throw new Error("Expected the admission verification epoch");
      const winningOperationId = competingOperationIds[competitors.indexOf(winning)];
      expect(winning.operationId).toBe(winningOperationId);
      await database.withContext(fixture.own, (transaction) => expectAdmissionProofInvalidationAudits(transaction, { tribeId: fixture.scope.tribeId, actorUserId: fixture.userId, operationId: winningOperationId, cause: "explicit_resend", proofs: [{ proofId, challengeId: original.challengeId, fromState: "available", requestId: null, verificationEpoch, channel: fixture.scope.channel }] }));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select is_current,invalidated_at is not null as invalidated,code_envelope_id from public.contact_verification_challenges where id=${original.challengeId}`)).rows).toEqual([{ is_current: false, invalidated: true, code_envelope_id: null }]);
        expect((await transaction.execute(sql`select status,invalidation_reason from public.academy_admission_verification_proofs where challenge_id=${original.challengeId}`)).rows).toEqual([{ status: "invalid", invalidation_reason: "explicit_resend" }]);
        expect((await transaction.execute(sql`select state,lease_token from public.message_deliveries where id=${original.deliveryId}`)).rows).toEqual([{ state: "queued", lease_token: lease }]);
        expect((await transaction.execute(sql`select id,state from public.message_delivery_attempts where delivery_id=${original.deliveryId}`)).rows).toEqual([{ id: attemptId, state: "in_flight" }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${attemptId}`)).rows).toEqual([{ state: "consumed" }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.contact_verification_challenges where tribe_id=${fixture.scope.tribeId} and is_current`)).rows).toEqual([{ total: 1 }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId} and event_type='code_request'`)).rows).toEqual([{ total: 2 }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId} and event_type='code_failure'`)).rows).toEqual([{ total: 1 }]);
      });
    });
  }, 180_000);

  it("should audit the original WhatsApp channel on an SMS resend and roll back staged proof facts when recovery is locked", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareIssuer(database, "admission", true);
      fixture.scope.channel = "whatsapp";
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.scope.tribeId}`);
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.scope.tribeId},${fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
      });
      const first = await fixture.issue();
      if (first.state !== "completed" || first.result.outcome !== "issued") throw new Error("Expected the original WhatsApp issuance");
      const original = first.result;
      const { code } = await recoverTestCode(database, fixture, original.challengeId);
      const verified = await database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: fixture.scope, challengeId: original.challengeId, operationId: randomUUID(), code }));
      if (verified.outcome !== "verified" || !verified.proofId) throw new Error("Expected the original available WhatsApp proof");
      const proofId = verified.proofId;
      await finishRequestCooldown(database, fixture);
      fixture.scope.channel = "sms";
      let activeTransaction: RequestDatabase | null = null;
      /** @returns Actual synthetic config until the original transaction has staged the proof audit, then the externally closed recovery condition. */
      const readInterruptedConfig = async (): Promise<MessagingSecurityConfig> => {
        if (!activeTransaction) throw new Error("Synthetic issuer transaction not initialized");
        const staged = (await activeTransaction.execute<{ total: number }>(sql`select count(*)::int as total from public.academy_admission_audit_events where resource_id=${proofId} and tribe_id=${fixture.scope.tribeId} and event_type='proof_invalidated'`)).rows[0].total;
        return staged > 0 ? { ...fixture.config, recoveryLocked: true } : fixture.config;
      };
      await expect(fixture.issue(original.challengeId, randomUUID(), readInterruptedConfig, async (transaction) => { activeTransaction = transaction; })).rejects.toMatchObject({ code: "connection_incomplete" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,invalidated_at from public.academy_admission_verification_proofs where id=${proofId}`)).rows).toEqual([{ status: "available", invalidated_at: null }]);
        expect((await transaction.execute(sql`select is_current from public.contact_verification_challenges where id=${original.challengeId}`)).rows).toEqual([{ is_current: true }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where tribe_id=${fixture.scope.tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId} and event_type='code_request') as requests`)).rows).toEqual([{ deliveries: 1, requests: 1 }]);
        await expectAdmissionProofInvalidationAudits(transaction, { tribeId: fixture.scope.tribeId, actorUserId: fixture.userId, operationId: randomUUID(), cause: "explicit_resend", proofs: [] });
      });
      const operationId = randomUUID();
      const resent = await fixture.issue(original.challengeId, operationId);
      expect(resent).toMatchObject({ state: "completed", result: { outcome: "issued" } });
      if (resent.state !== "completed" || resent.result.outcome !== "issued") throw new Error("Expected the prepared SMS resend");
      const expected = { tribeId: fixture.scope.tribeId, actorUserId: fixture.userId, operationId, cause: "explicit_resend", proofs: [{ proofId, challengeId: original.challengeId, fromState: "available" as const, requestId: null, verificationEpoch: 1, channel: "whatsapp" as const }] };
      await database.withContext(fixture.own, async (transaction) => {
        await expectAdmissionProofInvalidationAudits(transaction, expected);
        expect((await transaction.execute(sql`select channel from public.contact_verification_challenges where id=${resent.result.outcome === "issued" ? resent.result.challengeId : null}`)).rows).toEqual([{ channel: "sms" }]);
      });
      expect(await fixture.issue(original.challengeId, operationId)).toMatchObject({ ...resent, replayed: true });
      await database.withContext(fixture.own, (transaction) => expectAdmissionProofInvalidationAudits(transaction, expected));
    });
  }, 240_000);

  it("should require the current phone country before issuance while a later country removal preserves local validation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareIssuer(database, "admission", true);
      expect(await fixture.issue()).toMatchObject({ state: "completed", result: { outcome: "denied", code: "recipient_not_allowed" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as total from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([{ total: 0 }]);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.scope.tribeId}`);
      });
      const issued = await fixture.issue();
      if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Allowed synthetic phone issuance did not complete");
      const { code } = await recoverTestCode(database, fixture, issued.result.challengeId);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select queued_usage_policy_version,recipient_country from public.message_deliveries where id=${issued.result.outcome === "issued" ? issued.result.deliveryId : null}`)).rows).toEqual([{ queued_usage_policy_version: 2, recipient_country: "AR" }]);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries='{}',version=version+1 where tribe_id=${fixture.scope.tribeId}`);
        expect(await createContactVerificationWriter(transaction, fixture).validate({ scope: fixture.scope, challengeId: issued.result.outcome === "issued" ? issued.result.challengeId : "", operationId: randomUUID(), code })).toMatchObject({ outcome: "verified" });
      });
    });
  }, 180_000);

  it("should roll back request accounting and all code effects when the external recovery lock changes after crypto", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareIssuer(database);
      let reads = 0;
      const readConfig = async (): Promise<MessagingSecurityConfig> => { reads += 1; return { ...fixture.config, recoveryLocked: reads > 1 }; };
      await expect(fixture.issue(null, randomUUID(), readConfig)).rejects.toMatchObject({ code: "connection_incomplete" });
      await database.withContext(fixture.own, async (transaction) => {
        for (const result of [await transaction.execute(sql`select count(*)::integer as total from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId}`), await transaction.execute(sql`select count(*)::integer as total from public.contact_verification_challenges where tribe_id=${fixture.scope.tribeId}`), await transaction.execute(sql`select count(*)::integer as total from public.message_deliveries where tribe_id=${fixture.scope.tribeId}`), await transaction.execute(sql`select count(*)::integer as total from public.verification_code_envelopes where tribe_id=${fixture.scope.tribeId}`)]) expect(result.rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select state from public.academy_admission_operations where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([{ state: "started" }]);
      });
    });
  }, 180_000);

  it.each([MESSAGING_KEY_PURPOSE.verificationMac, MESSAGING_KEY_PURPOSE.otpEnvelope, MESSAGING_KEY_PURPOSE.credential])("should roll back a completed local issuance when %s is retired during persistence while the operation key remains available", async (purpose) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareIssuer(database);
      let reads = 0;
      const readConfig = async (): Promise<MessagingSecurityConfig> => {
        reads += 1;
        return reads < 3 ? fixture.config : { ...fixture.config, keyrings: { ...fixture.config.keyrings, [purpose]: { ...fixture.config.keyrings[purpose], keys: new Map() } } };
      };
      await expect(fixture.issue(null, randomUUID(), readConfig)).rejects.toMatchObject({ code: "connection_incomplete" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id from public.contact_verification_challenges where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.message_deliveries where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.verification_code_envelopes where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select state from public.academy_admission_operations where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([{ state: "started" }]);
      });
    });
  }, 180_000);

  it("should issue a candidate diagnostic with its own source and no admission proof or automatic capability preparation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareIssuer(database, "connection_diagnostic");
      const issued = await fixture.issue();
      if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Synthetic diagnostic issuance did not complete");
      const original = issued.result;
      const { code } = await recoverTestCode(database, fixture, original.challengeId);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select source_resource_id,purpose from public.message_deliveries where id=${original.deliveryId}`)).rows).toEqual([{ source_resource_id: original.diagnosticId, purpose: "connection_diagnostic" }]);
        expect(await createContactVerificationWriter(transaction, fixture).validate({ scope: fixture.scope, challengeId: original.challengeId, operationId: randomUUID(), code })).toMatchObject({ outcome: "verified", proofId: null });
        expect((await transaction.execute(sql`select state,tested_at from public.messaging_connection_capabilities where connection_id=${fixture.scope.connectionId}`)).rows).toEqual([{ state: "unprepared", tested_at: null }]);
        expect((await transaction.execute(sql`select event_type from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId} order by event_type`)).rows).toEqual([{ event_type: "code_request" }, { event_type: "diagnostic_request" }]);
      });
      await finishRequestCooldown(database, fixture);
      expect(await fixture.issue(original.challengeId)).toMatchObject({ state: "completed", result: { outcome: "issued" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state from public.message_deliveries where id=${original.deliveryId}`)).rows).toEqual([{ state: "cancelled" }]);
        expect((await transaction.execute(sql`select outcome from public.messaging_connection_diagnostics where id=${original.diagnosticId}`)).rows).toEqual([{ outcome: "invalidated" }]);
        expect((await transaction.execute(sql`select id from public.academy_admission_verification_proofs where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([]);
        await expectAdmissionProofInvalidationAudits(transaction, { tribeId: fixture.scope.tribeId, actorUserId: fixture.userId, operationId: randomUUID(), cause: "explicit_resend", proofs: [] });
      });
    });
  }, 180_000);
  it("should deny a connection test with usage_policy_missing, not connection_incomplete, while the tribe has no saved usage policy", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareIssuer(database, "connection_diagnostic", false, undefined, undefined, false);
      expect(await fixture.issue()).toMatchObject({ state: "completed", result: { outcome: "denied", code: "usage_policy_missing" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as total from public.message_deliveries where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([{ total: 0 }]);
      });
    });
  }, 180_000);
});
