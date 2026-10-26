/** @vitest-environment node */
/** Reproduces final external-snapshot and reconciled-material failures against native group/outbox state. @module admission-notification-group-preparation-security-tests */
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupsForEmail } from "@/tests/support/admission-notification-group-preparation-fixture";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { PostgresAdmissionNotificationGroupPreparation } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-group-preparation";
import { registerMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionNotificationCollectionExecutor, AdmissionNotificationCollectionAuthorizer } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-collection-progress";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission group preparation security", () => {
  it("should roll back every late final-snapshot change and refuse changed or unenrolled payload material without enrolling any key", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupsForEmail(database);
      const execute: AdmissionNotificationCollectionExecutor = (run) => database.withContext(fixture.system, run);
      const authorize: AdmissionNotificationCollectionAuthorizer = async (transaction, tribeId) => tribeId === fixture.tribeId && (await transaction.execute<{ allowed: boolean }>(sql`select public.current_app_user_id() is null and has_function_privilege(current_user,'public.check_messaging_key_material_proof(text,text,bytea)','EXECUTE') as allowed`)).rows[0].allowed;
      // Given explicitly reconciled original platform material, separate from the routine preparer.
      await execute((transaction) => registerMessagingPrivateMacKeyMaterial(transaction, fixture.keys.config, MESSAGING_KEY_PURPOSE.operationPayload));
      await fixture.execute((transaction) => transaction.execute(sql`insert into public.admission_notification_preferences(tribe_id,recipient_user_id,mode,version) values (${fixture.tribeId},${fixture.leaderId},'individual',1)`));
      const sourceBatch = await fixture.createSources(6);
      const commands = [];
      for (const source of sourceBatch.sources) commands.push(await fixture.collect(source.obligation_id));
      const replacement = await crypto.subtle.importKey("raw", randomBytes(MESSAGING_CRYPTO.keyBytes), { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);
      const ring = fixture.keys.config.keyrings.operation_payload;
      const changes: readonly { name: string; late: boolean; config: MessagingSecurityConfig }[] = [
        { name: "final-recovery-lock", late: true, config: { ...fixture.keys.config, recoveryLocked: true } },
        { name: "final-environment", late: true, config: { ...fixture.keys.config, environment: "changed-after-final-guard" } },
        { name: "final-security-epoch", late: true, config: { ...fixture.keys.config, securityEpoch: "changed-after-final-guard" } },
        { name: "final-payload-key-removed", late: true, config: { ...fixture.keys.config, keyrings: { ...fixture.keys.config.keyrings, operation_payload: { ...ring, keys: new Map() } } } },
        { name: "same-id-different-material", late: false, config: { ...fixture.keys.config, keyrings: { ...fixture.keys.config.keyrings, operation_payload: { ...ring, keys: new Map([[ring.activeKeyId, replacement]]) } } } },
        { name: "unreconciled-new-id", late: false, config: { ...fixture.keys.config, keyrings: { ...fixture.keys.config.keyrings, operation_payload: { ...ring, activeKeyId: "unreconciled-payload-key", keys: new Map([...ring.keys, ["unreconciled-payload-key", replacement]]) } } } },
      ];
      const outcomes: { name: string; status: string; code: string | null; stagedObserved: boolean }[] = [];
      // When actual effects exist, change only the last returned local snapshot while retaining the credential key.
      for (const [index, change] of changes.entries()) {
        const command = commands[index];
        let stagedObserved = false, stagedReads = 0;
        const preparation = new PostgresAdmissionNotificationGroupPreparation(execute, async (transaction, tribeId) => {
          const allowed = await authorize(transaction, tribeId);
          stagedObserved ||= Boolean((await transaction.execute(sql`select delivery.id from public.message_deliveries delivery join public.admission_notification_groups notification_group on notification_group.id=delivery.notification_group_id where notification_group.id=${command.groupId} and notification_group.state='frozen'`)).rows[0]);
          return allowed;
        }, async () => {
          if (!change.late) return change.config;
          if (stagedObserved && ++stagedReads >= 2) return change.config;
          return fixture.keys.config;
        }, "https://example.invalid");
        try {
          await preparation.prepare(command);
          outcomes.push({ name: change.name, status: "fulfilled", code: null, stagedObserved });
        } catch (error) {
          outcomes.push({ name: change.name, status: "rejected", code: error instanceof AdmissionOperationError ? error.code : "unclassified", stagedObserved });
        }
      }
      const snapshot = await execute(async (transaction) => (await transaction.execute(sql`select
        (select count(*)::int from public.admission_notification_groups where tribe_id=${fixture.tribeId} and state='open' and version=1) as open_groups,
        (select count(*)::int from public.admission_notification_group_members where tribe_id=${fixture.tribeId} and state='pending') as pending_members,
        (select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId} and purpose='admission_notification') as deliveries,
        (select count(*)::int from public.messaging_key_material_proofs where purpose='operation_payload' and key_id='unreconciled-payload-key') as new_proofs,
        (select count(*)::int from public.messaging_key_material_proofs where purpose='operation_payload' and key_id=${ring.activeKeyId}) as original_proofs`)).rows[0]);
      // Then the real rows and immutable original proof survive unchanged; no failed operation enrolls material.
      for (const outcome of outcomes) expect.soft(outcome.status, outcome.name).toBe("rejected");
      expect.soft(outcomes).toEqual(changes.map((change) => ({ name: change.name, status: "rejected", code: "connection_incomplete", stagedObserved: change.late })));
      expect(snapshot).toEqual({ open_groups: 6, pending_members: 6, deliveries: 0, new_proofs: 0, original_proofs: 1 });
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
