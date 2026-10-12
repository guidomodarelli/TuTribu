/** @vitest-environment node */
/** Exercises the original twenty-four-hour purge deadline with coherent historical resources and real PostgreSQL time. @module retired-secret-purge-deadline-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { PostgresSecretMaterialMaintenance } from "@/src/modules/messaging/infrastructure/repositories/postgres-secret-material-maintenance";
import { createRequestMessagingMaintenanceAuthorizer } from "@/src/modules/messaging/infrastructure/auth/request-maintenance-authorizer";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native retired credential purge deadline", () => {
  it("should preserve a not-yet-due secret, purge exactly the eligible original reference and refuse postponement or revival", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const security = await prepareContactVerificationDatabase(database);
      await database.applyMigration("20261005100000_guard_messaging_secret_retirement.sql");
      const userId = randomUUID(), tribeId = randomUUID(), own = { userId, email: `${userId}@example.test` };
      await database.withContext(security.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Responsable histórico de ejemplo',${own.email},false,transaction_timestamp()-interval '3 days',transaction_timestamp()-interval '3 days')`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by,created_at) values (${tribeId},'Academia de plazos de purga',${`purge-${tribeId}`},${userId},transaction_timestamp()-interval '2 days')`);
      });
      const references: Array<{ secretRef: string; connectionId: string; due: boolean }> = [];
      for (const due of [false, true]) {
        const connectionId = randomUUID(), secretRef = randomUUID();
        const envelope = await createMessagingSecretCipher(security.config).seal(randomUUID(), { tribeId, connectionId, connectionVersion: 1, resourceId: secretRef });
        await database.withContext(own, async (transaction) => {
          await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,is_selected,created_at,updated_at) values (${connectionId},${tribeId},${userId},'disconnected',${security.config.environment},${security.config.securityEpoch},false,false,transaction_timestamp()-interval '36 hours',transaction_timestamp()-interval '24 hours')`);
          await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,created_at,last_activity_at,retired_at,purge_after) values (${connectionId},${tribeId},1,${security.config.environment},${security.config.securityEpoch},${secretRef},transaction_timestamp()-interval '36 hours',transaction_timestamp()-interval '30 hours',transaction_timestamp()-interval '24 hours',transaction_timestamp())`);
          // Both rows keep the original 24h maximum; one is due now and one still has a real minute remaining.
          const retiredAt = (await transaction.execute<{ retired_at: Date }>(sql`select clock_timestamp()-interval '24 hours'+case when ${due} then interval '0 seconds' else interval '1 minute' end as retired_at`)).rows[0].retired_at;
          await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext,created_at,retired_at) values (${secretRef},${tribeId},${connectionId},1,${security.config.environment},${security.config.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)},transaction_timestamp()-interval '36 hours',${retiredAt})`);
        });
        references.push({ secretRef, connectionId, due });
      }
      const bearer = randomUUID();
      const authorize = createRequestMessagingMaintenanceAuthorizer(new Request("https://example.test/api/maintenance/messaging", { headers: { authorization: `Bearer ${bearer}` } }), () => bearer);
      const maintenance = new PostgresSecretMaterialMaintenance((run) => database.withContext(own, run), authorize);
      const before = await database.withContext(own, async (transaction) => (await transaction.execute<{ secret_ref: string; exact_window: boolean; eligible: boolean; has_bytes: boolean }>(sql`select secret_ref,purge_after=retired_at+interval '24 hours' as exact_window,purge_after<=clock_timestamp() as eligible,iv is not null and ciphertext is not null as has_bytes from public.messaging_secret_envelopes where tribe_id=${tribeId} order by secret_ref`)).rows);
      expect(before).toHaveLength(2);
      expect(before.every((row) => row.exact_window && row.has_bytes)).toBe(true);
      expect(references.every((reference) => before.some((row) => row.secret_ref === reference.secretRef && row.eligible === reference.due))).toBe(true);
      const future = references.find((reference) => !reference.due)!;
      await expect(database.withContext(own, (transaction) => transaction.execute(sql`update public.messaging_secret_envelopes set purge_after=purge_after+interval '1 second' where secret_ref=${future.secretRef}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      expect(await maintenance.purgeRetired(1)).toBe(1);
      expect(await maintenance.purgeRetired(1)).toBe(0);
      const after = await database.withContext(own, async (transaction) => (await transaction.execute<{ secret_ref: string; purged: boolean; has_bytes: boolean; reference_retained: boolean }>(sql`select envelope.secret_ref,envelope.purged_at is not null as purged,envelope.iv is not null and envelope.ciphertext is not null as has_bytes,resource.secret_ref=envelope.secret_ref as reference_retained from public.messaging_secret_envelopes envelope join public.messaging_connection_versions resource on resource.secret_ref=envelope.secret_ref where envelope.tribe_id=${tribeId}`)).rows);
      expect(after).toHaveLength(2);
      expect(references.every((reference) => after.some((row) => row.secret_ref === reference.secretRef && row.purged === reference.due && row.has_bytes === !reference.due && row.reference_retained))).toBe(true);
      const purged = references.find((reference) => reference.due)!;
      await expect(database.withContext(own, (transaction) => transaction.execute(sql`update public.messaging_secret_envelopes set retired_at=null,purged_at=null where secret_ref=${purged.secretRef}`))).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
