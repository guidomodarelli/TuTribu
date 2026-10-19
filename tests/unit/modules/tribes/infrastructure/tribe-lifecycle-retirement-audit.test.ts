/** @vitest-environment node */
/** Exercises real scope effects, original lineage and minimized archival without provider requests. @module tribe-lifecycle-retirement-audit-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { seedContactVerificationChallenge, createContactVerificationWriter } from "@/tests/support/contact-verification-database-fixture";
import { TRIBE_LIFECYCLE_AUDIT_MIGRATIONS } from "@/tests/support/constants/tribe-lifecycle-audit";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { TRIBE_LIFECYCLE_AUDIT_CONTEXT } from "@/src/modules/tribes/constants/tribe-lifecycle";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresTribeLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-lifecycle-repository";
import { ManageTribeLifecycleUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-lifecycle-use-cases";
import { createAdmissionScopeClosureWriter } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native lifecycle retirement audit", () => {
  it.each(["exit_academy", "delete_tribe"] as const)("should retain exact proof and queued effects from %s with the real original and no contact material", async (action) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");
      await database.applyMigration("20261006220000_extend_admission_notifications.sql");
      const challenge = await seedContactVerificationChallenge(database, fixture, "admission", undefined, undefined, "email", undefined, fixture.tribeId);
      for (const migration of TRIBE_LIFECYCLE_AUDIT_MIGRATIONS) await database.applyMigration(migration);
      const proof = await database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: challenge.scope, challengeId: challenge.challengeId, operationId: randomUUID(), code: challenge.code }));
      if (proof.outcome !== "verified" || !proof.proofId) throw new Error("Lifecycle audit fixture failed: local_proof_unavailable");
      const notificationId = randomUUID(), diagnosticId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        for (const delivery of [{ id: notificationId, purpose: "admission_notification" }, { id: diagnosticId, purpose: "connection_diagnostic" }]) {
          await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) select ${delivery.id},tribe_id,connection_id,connection_version,environment,security_epoch,${delivery.purpose},${randomUUID()},actor_user_id,recipient_ref,channel,${randomUUID()},payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at from public.message_deliveries where id=${challenge.deliveryId}`);
        }
      });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const lifecycle = new ManageTribeLifecycleUseCases(accounts, new PostgresTribeLifecycleRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createAdmissionScopeClosureWriter));
      const settings = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ config_version: number }>(sql`select config_version from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`)).rows[0]);
      const command = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), action, expectedConfigVersion: settings.config_version, confirmed: true };
      expect(await lifecycle.change(command)).toMatchObject({ state: "completed", replayed: false });
      expect(await lifecycle.change(command)).toMatchObject({ state: "completed", replayed: true });
      if (action === "exit_academy") {
        await database.withContext(fixture.own, async (transaction) => {
          expect((await transaction.execute(sql`select state,version from public.message_deliveries where id=${diagnosticId}`)).rows).toEqual([{ state: "queued", version: 1 }]);
          expect((await transaction.execute(sql`select audit.operation_id,audit.tribe_lifecycle_operation_id,audit.actor_user_id,audit.metadata,audit.created_at=proof.invalidated_at as owner_clock from public.academy_admission_audit_events audit join public.academy_admission_verification_proofs proof on proof.id=audit.resource_id and proof.tribe_id=audit.tribe_id where audit.resource_id=${proof.proofId} and audit.event_type='proof_invalidated'`)).rows).toEqual([{ operation_id: null, tribe_lifecycle_operation_id: command.operationId, actor_user_id: fixture.userId, owner_clock: true, metadata: { fromState: "available", toState: "invalid", challengeId: challenge.challengeId, requestId: null, verificationEpoch: 1, channel: "email" } }]);
          // The archive must discard arbitrary private fields even from an existing scope event.
          await transaction.execute(sql`update public.academy_admission_audit_events set metadata=metadata||jsonb_build_object('recipient',${fixture.own.email}::text,'verificationCode',${challenge.code}::text) where tribe_id=${fixture.tribeId} and cause='scope_retired'`);
          // Exercise the archive's lifetime independently of shorter-lived proof/challenge/delivery material.
          await transaction.execute(sql`delete from public.academy_admission_verification_proofs where id=${proof.proofId}`);
          await transaction.execute(sql`delete from public.contact_verification_challenges where id=${challenge.challengeId}`);
          await transaction.execute(sql`delete from public.message_deliveries where id=${challenge.deliveryId}`);
        });
        const other = await seedContactVerificationChallenge(database, fixture);
        for (const target of [{ tribeId: fixture.tribeId, actorUserId: fixture.userId, operationId: randomUUID() }, { tribeId: other.scope.tribeId, actorUserId: fixture.userId, operationId: command.operationId }, { tribeId: fixture.tribeId, actorUserId: randomUUID(), operationId: command.operationId }]) {
          await expect(database.withContext({ userId: target.actorUserId, email: null }, async (transaction) => {
            await transaction.execute(sql`select set_config(${TRIBE_LIFECYCLE_AUDIT_CONTEXT},${target.operationId},true)`);
            await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,resource_type,event_type) values (${target.tribeId},'message_delivery','delivery_cancelled')`);
          })).rejects.toMatchObject({ cause: { code: "42501" } });
        }
        expect(await lifecycle.change({ ...command, operationId: randomUUID(), action: "delete_tribe", expectedConfigVersion: settings.config_version + 1 })).toMatchObject({ state: "completed", replayed: false });
      }
      await database.withContext(fixture.own, async (transaction) => {
        const rows = (await transaction.execute<{ resource_id: string; event_type: string; tribe_lifecycle_operation_id: string; metadata: unknown; actor_reference_matches: boolean; owner_clock: boolean }>(sql`select audit.resource_id,audit.event_type,audit.operation_id,audit.tribe_lifecycle_operation_id,audit.cause,audit.resource_version,audit.metadata,audit.actor_reference_id=operation.actor_reference_id as actor_reference_matches,audit.created_at>=operation.created_at as owner_clock from public.academy_admission_retired_audit_events audit join public.tribe_lifecycle_operations operation on operation.tribe_id=audit.tribe_id and operation.operation_id=audit.tribe_lifecycle_operation_id where audit.tribe_id=${fixture.tribeId} and audit.cause='scope_retired' order by audit.event_type,audit.resource_id`)).rows;
        expect(rows).toHaveLength(4);
        expect(rows.every((row) => row.actor_reference_matches && row.owner_clock)).toBe(true);
        const retiredProof = rows.find((row) => row.resource_id === proof.proofId);
        expect(retiredProof).toMatchObject({ operation_id: null, tribe_lifecycle_operation_id: command.operationId, event_type: "proof_invalidated", resource_version: null, metadata: { fromState: "available", toState: "invalid", challengeId: challenge.challengeId, requestId: null, verificationEpoch: 1, channel: "email" } });
        for (const deliveryId of [challenge.deliveryId, notificationId, diagnosticId]) {
          const audit = rows.find((row) => row.resource_id === deliveryId);
          expect(audit).toMatchObject({ operation_id: null, event_type: "delivery_cancelled", cause: "scope_retired", resource_version: 2, metadata: { fromState: "queued", toState: "cancelled", previousVersion: 1, connectionId: challenge.scope.connectionId, connectionVersion: 1, channel: "email", attemptId: null, authorizedUsagePolicyVersion: null } });
          if (deliveryId !== diagnosticId || action === "delete_tribe") expect(audit?.tribe_lifecycle_operation_id).toBe(command.operationId);
        }
        const serialized = JSON.stringify(rows);
        expect(serialized).not.toContain(fixture.userId);
        expect(serialized).not.toContain(fixture.own.email);
        expect(serialized).not.toContain(challenge.code);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.message_deliveries where tribe_id=${fixture.tribeId} and state='cancelled'`)).rows).toEqual([{ total: action === "exit_academy" ? 2 : 3 }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_audit_events where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
      });
      await database.grantTablesToNonBypass(["academy_admission_retired_audit_events"]);
      await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select id from public.academy_admission_retired_audit_events where tribe_id=${fixture.tribeId}`)).rows).toEqual([]); }, "non_bypass");
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
