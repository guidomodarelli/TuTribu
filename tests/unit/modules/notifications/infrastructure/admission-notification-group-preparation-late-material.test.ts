/** @vitest-environment node */
/** Exercises a final same-id material replacement after observing actual staged group/outbox rows. @module admission-notification-group-preparation-late-material-tests */
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupsForEmail } from "@/tests/support/admission-notification-group-preparation-fixture";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { PostgresAdmissionNotificationGroupPreparation } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-group-preparation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native final grouped payload material", () => {
  it("should reject final same-id material replacement and roll back the actual frozen group and outbox while retaining the original proof", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupsForEmail(database);
      await fixture.execute((transaction) => transaction.execute(sql`insert into public.admission_notification_preferences(tribe_id,recipient_user_id,mode,version) values (${fixture.tribeId},${fixture.leaderId},'individual',1)`));
      const created = await fixture.createSources(1), command = await fixture.collect(created.sources[0].obligation_id);
      const ring = fixture.keys.config.keyrings.operation_payload;
      const replacement = await crypto.subtle.importKey("raw", randomBytes(MESSAGING_CRYPTO.keyBytes), { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);
      const changed = { ...fixture.keys.config, keyrings: { ...fixture.keys.config.keyrings, operation_payload: { ...ring, keys: new Map([[ring.activeKeyId, replacement]]) } } };
      let stagedObserved = false, stagedSnapshots = 0, outcome: string;
      const preparation = new PostgresAdmissionNotificationGroupPreparation(fixture.preparationExecute, async (transaction, tribeId) => {
        const allowed = await fixture.preparationAuthorize(transaction, tribeId);
        stagedObserved ||= Boolean((await transaction.execute(sql`select delivery.id from public.message_deliveries delivery join public.admission_notification_groups notification_group on notification_group.id=delivery.notification_group_id where notification_group.id=${command.groupId} and notification_group.state='frozen'`)).rows[0]);
        return allowed;
      }, async () => stagedObserved && ++stagedSnapshots >= 2 ? changed : fixture.keys.config, "https://example.invalid");
      try {
        const result = await preparation.prepare(command);
        outcome = `fulfilled:${result.status}`;
      } catch (error) {
        outcome = `rejected:${error instanceof AdmissionOperationError ? error.code : "unclassified"}`;
      }
      const snapshot = await fixture.preparationExecute(async (transaction) => (await transaction.execute(sql`select notification_group.state,notification_group.version,
        (select count(*)::int from public.message_deliveries where notification_group_id=${command.groupId}) as deliveries,
        (select count(*)::int from public.admission_notification_group_members where group_id=${command.groupId} and state='pending') as pending_members,
        (select count(*)::int from public.messaging_key_material_proofs where purpose='operation_payload' and key_id=${ring.activeKeyId}) as original_proofs
        from public.admission_notification_groups notification_group where notification_group.id=${command.groupId}`)).rows[0]);
      expect(stagedObserved).toBe(true);
      expect.soft(outcome).toBe("rejected:connection_incomplete");
      expect(snapshot).toEqual({ state: "open", version: 1, deliveries: 0, pending_members: 1, original_proofs: 1 });
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
