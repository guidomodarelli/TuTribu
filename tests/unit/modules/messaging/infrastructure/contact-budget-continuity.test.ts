/** @vitest-environment node */
/** Exercises protected contact identities and consumption continuity across keyring rotation on real SQL. */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase, seedContactVerificationChallenge } from "@/tests/support/contact-verification-database-fixture";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/** Keeps every other purpose intact and rotates only the platform-owned contact index key. */
async function rotateContactKey(config: MessagingSecurityConfig, keyId: string, retainPrevious: boolean): Promise<MessagingSecurityConfig> {
  const key = await crypto.subtle.importKey("raw", randomBytes(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const current = config.keyrings.contact_fingerprint;
  return { ...config, keyrings: { ...config.keyrings, contact_fingerprint: { purpose: current.purpose, activeKeyId: keyId, keys: new Map([...(retainPrevious ? current.keys : []), [keyId, key]]) } } };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("contact budget continuity", () => {
  it("should bridge retained keys onto one contact subject and preserve its committed consumption after retirement", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture);
      await database.applyMigration("20261006120000_index_messaging_contact_windows.sql");
      const resolve = (config: MessagingSecurityConfig) => database.withContext(fixture.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => config).resolve(challenge.scope.contact));
      const first = await resolve(fixture.config);
      await database.withContext(fixture.own, async (transaction) => transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,contact_subject_id,purpose,channel,event_type,operation_id) values (${challenge.scope.tribeId},${fixture.userId},${first.subjectId},'admission','email','code_request',${randomUUID()})`));
      const rotated = await rotateContactKey(fixture.config, "synthetic-contact-next", true);
      const bridged = await resolve(rotated);
      expect(bridged.subjectId).toBe(first.subjectId);
      expect(bridged.fingerprintKeyId).toBe("synthetic-contact-next");
      expect(bridged.fingerprint).not.toEqual(first.fingerprint);
      const retired: MessagingSecurityConfig = { ...rotated, keyrings: { ...rotated.keyrings, contact_fingerprint: { ...rotated.keyrings.contact_fingerprint, keys: new Map([[rotated.keyrings.contact_fingerprint.activeKeyId, rotated.keyrings.contact_fingerprint.keys.get(rotated.keyrings.contact_fingerprint.activeKeyId)!]]) } } };
      expect((await resolve(retired)).subjectId).toBe(first.subjectId);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as aliases from public.messaging_contact_fingerprint_aliases where subject_id=${first.subjectId}`)).rows).toEqual([{ aliases: 2 }]);
        expect((await transaction.execute(sql`select contact_subject_id from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_request'`)).rows).toEqual([{ contact_subject_id: first.subjectId }]);
      });
    });
  }, 180_000);

  it("should close a new identity when an unbridged retired key still carries recent consumption", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture);
      await database.applyMigration("20261006120000_index_messaging_contact_windows.sql");
      const first = await database.withContext(fixture.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config).resolve(challenge.scope.contact));
      await database.withContext(fixture.own, async (transaction) => transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,contact_subject_id,purpose,channel,event_type,operation_id) values (${challenge.scope.tribeId},${fixture.userId},${first.subjectId},'admission','email','code_request',${randomUUID()})`));
      const replacement = await rotateContactKey(fixture.config, "unbridged-contact-key", false);
      await expect(database.withContext(fixture.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => replacement).resolve(challenge.scope.contact))).rejects.toMatchObject({ code: "usage_limit_reached" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::integer as subjects from public.messaging_contact_budget_subjects`)).rows)).toEqual([{ subjects: 1 }]);
    });
  }, 180_000);

  it("should resolve one retained-key subject with bounded database access despite a large alias history", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture);
      await database.applyMigration("20261006120000_index_messaging_contact_windows.sql");
      const first = await database.withContext(fixture.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config).resolve(challenge.scope.contact));
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`with subjects as (insert into public.messaging_contact_budget_subjects(id) select gen_random_uuid() from generate_series(1,20000) returning id) insert into public.messaging_contact_fingerprint_aliases(subject_id,fingerprint_key_id,contact_fingerprint) select id,${first.fingerprintKeyId},uuid_send(id)||uuid_send(id) from subjects`);
        await transaction.execute(sql`analyze public.messaging_contact_fingerprint_aliases`);
        const explained = (await transaction.execute<{ "QUERY PLAN": { Plan: { "Actual Rows": number; "Shared Hit Blocks": number; "Shared Read Blocks": number } }[] }>(sql`explain (analyze,buffers,format json) select 1 from public.messaging_contact_fingerprint_aliases where subject_id=${first.subjectId} and fingerprint_key_id=${first.fingerprintKeyId}`)).rows[0]["QUERY PLAN"][0].Plan;
        expect(explained["Actual Rows"]).toBe(1);
        expect(explained["Shared Hit Blocks"] + explained["Shared Read Blocks"]).toBeLessThanOrEqual(8);
        expect((await new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config).resolve(challenge.scope.contact)).subjectId).toBe(first.subjectId);
      });
    });
  }, 180_000);
});
