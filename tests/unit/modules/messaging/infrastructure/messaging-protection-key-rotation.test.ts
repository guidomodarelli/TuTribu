/** @vitest-environment node */
/** Exercises actual bounded cipher rotation, retained original intents and irreversible retirement on PostgreSQL. @module messaging-protection-key-rotation-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingProtectionKeyRotation } from "@/tests/support/messaging-protection-key-rotation-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { buildMessagingProtectionKeyRotationModule } from "@/src/modules/messaging/setup";
import { projectMessagingProtectionKeyState } from "@/src/modules/messaging/infrastructure/config/messaging-protection-key-state";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import { PostgresVerificationDeliveryPreparation } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-delivery-preparation";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native private protection-key rotation", () => {
  it("should rewrap only current credentials in bounded idempotent batches and send the unchanged signed original with retained keys", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingProtectionKeyRotation(database), backend = { userId: null, email: null };
      const before = await fixture.snapshot(), candidatesBefore = await fixture.candidates.snapshot();
      let checkouts = 0;
      const dependencies = { execute: <Result>(run: (transaction: Parameters<Parameters<typeof database.withContext>[1]>[0]) => Promise<Result>) => { checkouts += 1; return database.withContext(backend, run); }, authorize: async () => true, readRecoveryLock: async () => false, readKeyState: async () => projectMessagingProtectionKeyState(fixture.rotated), readSecurityConfig: async () => fixture.rotated };
      const rotation = buildMessagingProtectionKeyRotationModule(dependencies).useCases.rotateProtectionKeys;
      await expect(rotation.execute({ limit: 101 })).rejects.toMatchObject({ code: "invalid_input" }); expect(checkouts).toBe(0);
      for (const remaining of [true, true, true, false]) expect(await rotation.execute({ limit: 1 })).toEqual({ rotatedCredentials: 1, remainingCredentials: remaining, pendingOtpMaterial: true });
      expect(checkouts).toBe(4);
      expect(await rotation.execute({ limit: 1 })).toEqual({ rotatedCredentials: 0, remainingCredentials: false, pendingOtpMaterial: true });
      const after = await fixture.snapshot();
      expect(after.usage).toEqual(before.usage); expect(after.policies).toEqual(before.policies); expect(after.original).toEqual(before.original); expect(after.challenge).toEqual(before.challenge);
      expect(after.credentials.filter((resource) => resource.key_id === fixture.rotated.keyrings.credential.activeKeyId)).toHaveLength(4);
      for (const credential of after.credentials.filter((resource) => resource.key_id === fixture.rotated.keyrings.credential.activeKeyId)) expect(credential).toEqual({ ...before.credentials.find((resource) => resource.secret_ref === credential.secret_ref), key_id: credential.key_id });
      expect(after.credentials.find((resource) => resource.secret_ref === fixture.retiredRef)).toEqual(before.credentials.find((resource) => resource.secret_ref === fixture.retiredRef));
      for (const resource of fixture.candidates.cases.filter((candidate) => candidate.name === "expired" || candidate.name === "late" || candidate.name === "selected_with_candidate")) {
        const original = before.credentials.find((credential) => credential.connection_id === resource.connectionId && credential.connection_version === resource.candidateVersion);
        expect(after.credentials.find((credential) => credential.secret_ref === original?.secret_ref)).toEqual(original);
      }
      expect((await fixture.candidates.snapshot()).connections).toEqual(candidatesBefore.connections);
      const subject = await database.withContext(fixture.pipeline.own, async (transaction) => (await transaction.execute<{ contact_subject_id: string }>(sql`select contact_subject_id from public.message_deliveries where id=${fixture.pipeline.original.deliveryId}`)).rows[0].contact_subject_id);
      const bridged = await database.withContext(fixture.pipeline.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async (current) => Boolean((await current.execute(sql`select id from public."user" where id=public.current_app_user_id()`)).rows[0]), async () => fixture.rotated).resolve(fixture.pipeline.scope.contact));
      expect(bridged.subjectId).toBe(subject);
      const withoutOldContact = { ...fixture.rotated, keyrings: { ...fixture.rotated.keyrings, contact_fingerprint: { ...fixture.rotated.keyrings.contact_fingerprint, keys: new Map([[fixture.rotated.keyrings.contact_fingerprint.activeKeyId, fixture.rotated.keyrings.contact_fingerprint.keys.get(fixture.rotated.keyrings.contact_fingerprint.activeKeyId)!]]) } } };
      expect((await database.withContext(fixture.pipeline.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => withoutOldContact).resolve(fixture.pipeline.scope.contact))).subjectId).toBe(subject);
      expect((await fixture.snapshot()).usage).toEqual(before.usage);
      const credentialRing = withoutOldContact.keyrings.credential, operational = { ...withoutOldContact, keyrings: { ...withoutOldContact.keyrings, credential: { ...credentialRing, keys: new Map([[credentialRing.activeKeyId, credentialRing.keys.get(credentialRing.activeKeyId)!]]) } } };
      expect(await buildMessagingProtectionKeyRotationModule({ ...dependencies, readKeyState: async () => projectMessagingProtectionKeyState(operational), readSecurityConfig: async () => operational }).useCases.rotateProtectionKeys.execute()).toEqual({ rotatedCredentials: 0, remainingCredentials: false, pendingOtpMaterial: true });
      await database.withContext(backend, async (transaction) => {
        const row = (await transaction.execute<{ key_id: string; iv: Uint8Array; ciphertext: Uint8Array }>(sql`select key_id,iv,ciphertext from public.messaging_secret_envelopes where secret_ref=(select secret_ref from public.messaging_connection_versions where connection_id=${fixture.pipeline.scope.connectionId} and version=1)`)).rows[0];
        const ref = (await transaction.execute<{ secret_ref: string }>(sql`select secret_ref from public.messaging_connection_versions where connection_id=${fixture.pipeline.scope.connectionId} and version=1`)).rows[0].secret_ref;
        const opened = await createMessagingSecretCipher(fixture.rotated).open({ format: 1, purpose: "credential", environment: fixture.rotated.environment, securityEpoch: fixture.rotated.securityEpoch, keyId: row.key_id, iv: row.iv, ciphertext: row.ciphertext }, { tribeId: fixture.pipeline.scope.tribeId, connectionId: fixture.pipeline.scope.connectionId, connectionVersion: 1, resourceId: ref });
        expect(opened === fixture.pipeline.credential).toBe(true);
        const audit = (await transaction.execute<{ actor_user_id: string | null; operation_id: string | null; resource_version: number | null; metadata: Record<string, unknown> }>(sql`select actor_user_id,operation_id,resource_version,metadata from public.academy_admission_audit_events where resource_type='messaging_protection' and event_type='protection_keys_rotated'`)).rows;
        expect(audit).toHaveLength(4);
        expect(audit.every((event) => event.actor_user_id === null && event.operation_id === null && event.resource_version === null && Object.keys(event.metadata).sort().join(",") === "activeKeyId,previousKeyId,purpose,securityEpoch")).toBe(true);
      });
      const repository = new PostgresMessageDeliveryRepository(fixture.pipeline.execute, async () => true, async () => operational);
      const claim = (await repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: 300 }))[0];
      if (!claim) throw new Error("Synthetic rotation original claim unavailable");
      const marker = await repository.authorize(claim, randomUUID());
      if (marker.outcome !== "authorized") throw new Error("Synthetic rotation original marker unavailable");
      const secrets = new PostgresEncryptedSecretStore(fixture.pipeline.execute, { getAuthenticatedAccount: async () => null }, async () => operational, "authorized_delivery");
      const preparation = new PostgresVerificationDeliveryPreparation(fixture.pipeline.execute, secrets, async () => operational);
      const providerId = randomUUID(), transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
        expect(request.headers.get("Authorization") === `Bearer ${fixture.pipeline.credential}`).toBe(true); expect(fixture.pipeline.transactions).toBe(0);
        return Response.json({ message: { id: providerId, direction: "outbound", channel: "email", status: "sent" } });
      } }]);
      const sender = new ZavuMessageDeliverySender(preparation, transport.fetch), receipt = await sender.send(marker.context, new AbortController().signal);
      expect(receipt).toMatchObject({ outcome: "accepted", providerMessageId: providerId });
      expect(await repository.complete({ context: marker.context, ...receipt })).toMatchObject({ outcome: "completed" });
      expect(transport.receipts).toHaveLength(1);
      expect((await fixture.snapshot()).original).toEqual(before.original);
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should deny request principals before key import and roll back cipher, audit and attestations on late authority, recovery or epoch changes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingProtectionKeyRotation(database), backend = { userId: null, email: null }, before = await fixture.snapshot();
      let checkouts = 0, keyReads = 0;
      const base = { execute: <Result>(run: (transaction: RequestDatabase) => Promise<Result>) => { checkouts += 1; return database.withContext(backend, run); }, authorize: async () => true, readRecoveryLock: async () => false, readKeyState: async () => projectMessagingProtectionKeyState(fixture.rotated), readSecurityConfig: async () => { keyReads += 1; return fixture.rotated; } };
      await expect(buildMessagingProtectionKeyRotationModule({ ...base, authorize: async () => false }).useCases.rotateProtectionKeys.execute()).rejects.toMatchObject({ code: "permission_denied" });
      await expect(buildMessagingProtectionKeyRotationModule({ ...base, readRecoveryLock: async () => true }).useCases.rotateProtectionKeys.execute()).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(checkouts).toBe(0); expect(keyReads).toBe(0);
      await expect(buildMessagingProtectionKeyRotationModule({ ...base, execute: (run) => database.withContext(fixture.pipeline.own, run) }).useCases.rotateProtectionKeys.execute()).rejects.toMatchObject({ code: "permission_denied" });
      await expect(buildMessagingProtectionKeyRotationModule({ ...base, execute: (run) => database.withContext(backend, run, "non_bypass") }).useCases.rotateProtectionKeys.execute()).rejects.toMatchObject({ code: "permission_denied" });
      expect(keyReads).toBe(0);
      const staged = async (transaction?: RequestDatabase) => transaction ? (await transaction.execute<{ changed: boolean }>(sql`select exists(select 1 from public.messaging_secret_envelopes where key_id=${fixture.rotated.keyrings.credential.activeKeyId}) as changed`)).rows[0].changed : false;
      for (const mode of ["authority", "recovery", "epoch"] as const) {
        let current = fixture.rotated;
        const dependencies = { ...base, authorize: async (transaction?: RequestDatabase) => {
          const changed = await staged(transaction);
          if (mode === "epoch" && changed) current = { ...current, securityEpoch: randomUUID() };
          return mode !== "authority" || !changed;
        }, readRecoveryLock: async (transaction?: RequestDatabase) => mode === "recovery" && await staged(transaction), readKeyState: async () => projectMessagingProtectionKeyState(current), readSecurityConfig: async () => current };
        await expect(buildMessagingProtectionKeyRotationModule(dependencies).useCases.rotateProtectionKeys.execute()).rejects.toMatchObject({ code: mode === "authority" ? "permission_denied" : "resource_unavailable" });
        expect(await fixture.snapshot()).toEqual(before);
      }
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should close unavailable identity, payload and OTP predecessors before key import and reject a changed target cipher under the same id", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingProtectionKeyRotation(database), backend = { userId: null, email: null }, before = await fixture.snapshot();
      for (const purpose of ["contact_fingerprint", "operation_payload", "otp_envelope", "verification_mac"] as const) {
        const ring = fixture.rotated.keyrings[purpose], current = { ...fixture.rotated, keyrings: { ...fixture.rotated.keyrings, [purpose]: { ...ring, keys: new Map([[ring.activeKeyId, ring.keys.get(ring.activeKeyId)!]]) } } };
        let keyReads = 0;
        const rotation = buildMessagingProtectionKeyRotationModule({ execute: (run) => database.withContext(backend, run), authorize: async () => true, readRecoveryLock: async () => false, readKeyState: async () => projectMessagingProtectionKeyState(current), readSecurityConfig: async () => { keyReads += 1; return current; } }).useCases.rotateProtectionKeys;
        await expect(rotation.execute()).rejects.toMatchObject({ code: "resource_unavailable" });
        expect(keyReads).toBe(0); expect(await fixture.snapshot()).toEqual(before);
      }
      const material = randomBytes(MESSAGING_CRYPTO.keyBytes);
      const replacement = await crypto.subtle.importKey("raw", material, { name: MESSAGING_CRYPTO.aesAlgorithm }, false, ["encrypt", "decrypt"]); material.fill(0);
      const ring = fixture.rotated.keyrings.credential, changed = { ...fixture.rotated, keyrings: { ...fixture.rotated.keyrings, credential: { ...ring, keys: new Map([...ring.keys, [ring.activeKeyId, replacement]]) } } };
      let reads = 0;
      const rotation = buildMessagingProtectionKeyRotationModule({ execute: (run) => database.withContext(backend, run), authorize: async () => true, readRecoveryLock: async () => false, readKeyState: async () => projectMessagingProtectionKeyState(fixture.rotated), readSecurityConfig: async () => { reads += 1; return reads < 3 ? fixture.rotated : changed; } }).useCases.rotateProtectionKeys;
      await expect(rotation.execute()).rejects.toMatchObject({ code: "resource_unavailable", cause: { code: "messaging_crypto_authentication_failed" } });
      expect(await fixture.snapshot()).toEqual(before);
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should skip another rotation's locked namespace and keep one bounded effect per owner without rewriting current envelopes again", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingProtectionKeyRotation(database), backend = { userId: null, email: null };
      const base = { execute: <Result>(run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(backend, run), authorize: async () => true, readRecoveryLock: async () => false, readKeyState: async () => projectMessagingProtectionKeyState(fixture.rotated), readSecurityConfig: async () => fixture.rotated };
      let announce!: () => void, reject!: (error: unknown) => void, release!: () => void, announced = false;
      const ready = new Promise<void>((resolve, rejectReady) => { announce = resolve; reject = rejectReady; }), released = new Promise<void>((resolve) => { release = resolve; });
      const first = buildMessagingProtectionKeyRotationModule({ ...base, readSecurityConfig: async () => { if (!announced) { announced = true; announce(); await released; } return fixture.rotated; } }).useCases.rotateProtectionKeys.execute({ limit: 1 });
      void first.catch(reject);
      await ready;
      let firstResult;
      try {
        expect(await buildMessagingProtectionKeyRotationModule(base).useCases.rotateProtectionKeys.execute({ limit: 1 })).toEqual({ rotatedCredentials: 1, remainingCredentials: true, pendingOtpMaterial: true });
      } finally { release(); firstResult = await first; }
      expect(firstResult).toEqual({ rotatedCredentials: 1, remainingCredentials: true, pendingOtpMaterial: true });
      expect(await buildMessagingProtectionKeyRotationModule(base).useCases.rotateProtectionKeys.execute()).toEqual({ rotatedCredentials: 2, remainingCredentials: false, pendingOtpMaterial: true });
      expect(await buildMessagingProtectionKeyRotationModule(base).useCases.rotateProtectionKeys.execute()).toEqual({ rotatedCredentials: 0, remainingCredentials: false, pendingOtpMaterial: true });
      expect((await fixture.snapshot()).credentials.filter((resource) => resource.key_id === fixture.rotated.keyrings.credential.activeKeyId)).toHaveLength(4);
    }, { concurrentTransactions: 3 });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should preserve a real commit with a lost acknowledgement and reconcile its source before an explicit idempotent continuation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingProtectionKeyRotation(database), backend = { userId: null, email: null };
      let executions = 0;
      const lost = new Error("Synthetic protection-key rotation commit acknowledgement lost");
      const dependencies = { execute: async <Result>(run: (transaction: RequestDatabase) => Promise<Result>): Promise<Result> => { executions += 1; await database.withContext(backend, run); throw lost; }, authorize: async () => true, readRecoveryLock: async () => false, readKeyState: async () => projectMessagingProtectionKeyState(fixture.rotated), readSecurityConfig: async () => fixture.rotated };
      await expect(buildMessagingProtectionKeyRotationModule(dependencies).useCases.rotateProtectionKeys.execute()).rejects.toMatchObject({ code: "operation_unresolved", cause: lost }); expect(executions).toBe(1);
      const persisted = await fixture.snapshot();
      expect(persisted.credentials.filter((resource) => resource.key_id === fixture.rotated.keyrings.credential.activeKeyId)).toHaveLength(4);
      const confirmed = buildMessagingProtectionKeyRotationModule({ ...dependencies, execute: <Result>(run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(backend, run) }).useCases.rotateProtectionKeys;
      expect(await confirmed.execute()).toEqual({ rotatedCredentials: 0, remainingCredentials: false, pendingOtpMaterial: true });
      expect(await fixture.snapshot()).toEqual(persisted);
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
