/** @vitest-environment node */
/** Exercises account/contact/cooldown request accounting with real SQL and protected contact identities. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase, seedContactVerificationChallenge } from "@/tests/support/contact-verification-database-fixture";
import { PostgresVerificationRequestBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-request-budget";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("verification code request budget", () => {
  it("should count one request once and share the resend wait between purposes and channels", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture);
      await database.applyMigration("20261006120000_index_messaging_contact_windows.sql");
      const operationId = randomUUID();
      const command = { scope: challenge.scope, operationId, challengeId: challenge.challengeId };
      const consume = (current = command) => database.withContext(fixture.own, (transaction) => new PostgresVerificationRequestBudget(transaction, async () => true, new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config)).consume(current));
      expect(await consume()).toMatchObject({ allowed: true, replayed: false });
      expect(await consume()).toMatchObject({ allowed: true, replayed: true });
      expect(await consume({ ...command, operationId: randomUUID(), scope: { ...challenge.scope, channel: "sms" } })).toMatchObject({ allowed: false, code: "usage_limit_reached" });
      expect(await consume({ ...command, operationId: randomUUID(), scope: { ...challenge.scope, purpose: "connection_diagnostic", verificationEpoch: null } })).toMatchObject({ allowed: false, code: "usage_limit_reached" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::integer as requests from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_request'`)).rows)).toEqual([{ requests: 1 }]);
    });
  }, 180_000);

  it("should reject the hourly account or contact ceiling and the diagnostic channel ceiling without recording another request", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture);
      await database.applyMigration("20261006120000_index_messaging_contact_windows.sql");
      const identity = await database.withContext(fixture.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config).resolve(challenge.scope.contact));
      await database.withContext(fixture.own, async (transaction) => {
        for (let request = 0; request < 5; request += 1) await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,contact_subject_id,purpose,channel,event_type,operation_id,occurred_at) values (${challenge.scope.tribeId},${fixture.userId},${identity.subjectId},'admission','email','code_request',${randomUUID()},clock_timestamp()-interval '2 minutes')`);
      });
      const consume = () => database.withContext(fixture.own, (transaction) => new PostgresVerificationRequestBudget(transaction, async () => true, new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config)).consume({ scope: challenge.scope, operationId: randomUUID(), challengeId: challenge.challengeId }));
      expect(await consume()).toMatchObject({ allowed: false, code: "usage_limit_reached" });
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`delete from public.messaging_usage_events where actor_user_id=${fixture.userId}`);
        for (let diagnostic = 0; diagnostic < 3; diagnostic += 1) await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,purpose,channel,event_type,operation_id,occurred_at) values (${challenge.scope.tribeId},${fixture.userId},'connection_diagnostic','email','diagnostic_request',${randomUUID()},clock_timestamp()-interval '2 minutes')`);
        const result = await new PostgresVerificationRequestBudget(transaction, async () => true, new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config)).consume({ scope: { ...challenge.scope, purpose: "connection_diagnostic", verificationEpoch: null }, operationId: randomUUID(), challengeId: challenge.challengeId });
        expect(result).toMatchObject({ allowed: false, code: "usage_limit_reached" });
        expect((await transaction.execute(sql`select id from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_request'`)).rows).toEqual([]);
      });
    });
  }, 180_000);

  it("should allow only one concurrent request for a bridged contact with one remaining hourly slot and disjoint keyrings", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture);
      await database.applyMigration("20261006120000_index_messaging_contact_windows.sql");
      const keyId = "synthetic-disjoint-contact";
      const key = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
      const ring = fixture.config.keyrings.contact_fingerprint;
      const bridgedConfig = { ...fixture.config, keyrings: { ...fixture.config.keyrings, contact_fingerprint: { ...ring, activeKeyId: keyId, keys: new Map([...ring.keys, [keyId, key]]) } } };
      const subject = await database.withContext(fixture.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => bridgedConfig).resolve(challenge.scope.contact));
      const otherUserId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${otherUserId},'Synthetic contact competitor',${`${otherUserId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        for (let request = 0; request < 4; request += 1) await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,contact_subject_id,purpose,channel,event_type,operation_id,occurred_at) values (${challenge.scope.tribeId},${fixture.userId},${subject.subjectId},'admission','email','code_request',${randomUUID()},clock_timestamp()-interval '2 minutes')`);
      });
      const newOnly = { ...bridgedConfig, keyrings: { ...bridgedConfig.keyrings, contact_fingerprint: { ...bridgedConfig.keyrings.contact_fingerprint, keys: new Map([[keyId,key]]) } } };
      let resolved = 0;
      let release!: () => void;
      const bothResolved = new Promise<void>((complete) => { release=complete; });
      const consume = (userId: string, config: typeof fixture.config) => database.withContext({ userId, email: null }, async (transaction) => {
        const repository = new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => config);
        const contacts = { async resolve(contact: typeof challenge.scope.contact) { const current = await repository.resolve(contact); resolved+=1; if(resolved===2) release(); await bothResolved; return current; } };
        return new PostgresVerificationRequestBudget(transaction, async () => true, contacts).consume({ scope: { ...challenge.scope, userId }, challengeId: challenge.challengeId, operationId: randomUUID() });
      });
      const outcomes = await Promise.all([consume(fixture.userId,fixture.config),consume(otherUserId,newOnly)]);
      expect(outcomes.filter((outcome) => outcome.allowed)).toHaveLength(1);
      expect(outcomes.filter((outcome) => !outcome.allowed)).toHaveLength(1);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::integer as requests from public.messaging_usage_events where contact_subject_id=${subject.subjectId} and event_type='code_request'`)).rows)).toEqual([{ requests: 5 }]);
    });
  }, 180_000);

  it("should enforce the UTC daily account and contact ceilings without resetting them to the session's local day", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture);
      await database.applyMigration("20261006120000_index_messaging_contact_windows.sql");
      await database.applyMigration("20261006230000_bind_credential_validation_usage.sql");
      const identity = await database.withContext(fixture.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config).resolve(challenge.scope.contact));
      const clock = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ can_isolate_daily: boolean; previous: Date | string }>(sql`with instant as (select clock_timestamp() as now), boundary as (select now,date_trunc('day',now at time zone 'UTC') at time zone 'UTC' as day_start from instant) select now-interval '2 hours'>=day_start as can_isolate_daily,case when now-interval '2 hours'>=day_start then day_start else day_start-interval '2 hours' end as previous from boundary`)).rows[0]);
      // Before the first two UTC hours a valid daily-only denial is unreachable;
      // that run instead proves yesterday's history does not spend today's slots.
      for (const owner of ["account", "contact"] as const) {
        await database.withContext(fixture.own, async (transaction) => {
          await transaction.execute(sql`delete from public.messaging_usage_events where event_type='code_request' and tribe_id=${challenge.scope.tribeId}`);
          await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,contact_subject_id,purpose,channel,event_type,operation_id,occurred_at) select ${challenge.scope.tribeId},${owner === "account" ? fixture.userId : null},${owner === "contact" ? identity.subjectId : null},'admission','email','code_request',gen_random_uuid(),${new Date(clock.previous)} from generate_series(1,20)`);
          await transaction.execute(sql`set local time zone 'Pacific/Kiritimati'`);
          const before = (await transaction.execute<{ daily: number; hourly: number }>(sql`select count(*) filter(where occurred_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')::integer as daily,count(*) filter(where occurred_at>clock_timestamp()-interval '1 hour')::integer as hourly from public.messaging_usage_events where event_type='code_request' and tribe_id=${challenge.scope.tribeId}`)).rows[0];
          expect(before).toEqual({ daily: clock.can_isolate_daily ? 20 : 0, hourly: 0 });
          const result = await new PostgresVerificationRequestBudget(transaction, async () => true, new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config)).consume({ scope: challenge.scope, operationId: randomUUID(), challengeId: challenge.challengeId });
          expect(result.allowed).toBe(!clock.can_isolate_daily);
          if (clock.can_isolate_daily) expect(result).toMatchObject({ code: "usage_limit_reached" });
          expect((await transaction.execute<{ total: number }>(sql`select count(*)::integer as total from public.messaging_usage_events where event_type='code_request' and tribe_id=${challenge.scope.tribeId}`)).rows[0].total).toBe(clock.can_isolate_daily ? 20 : 21);
        });
      }
    });
  }, 180_000);

  it("should close the diagnostic UTC day without creating a code-request event or resetting at a channel switch", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture, "connection_diagnostic");
      await database.applyMigration("20261006120000_index_messaging_contact_windows.sql");
      await database.applyMigration("20261006230000_bind_credential_validation_usage.sql");
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,purpose,channel,event_type,operation_id,occurred_at) select ${challenge.scope.tribeId},${fixture.userId},'connection_diagnostic','email','diagnostic_request',gen_random_uuid(),clock_timestamp()-interval '1 second' from generate_series(1,10)`);
        await transaction.execute(sql`set local time zone 'Pacific/Honolulu'`);
        const result = await new PostgresVerificationRequestBudget(transaction, async () => true, new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config)).consume({ scope: { ...challenge.scope, channel: "sms" }, operationId: randomUUID(), challengeId: challenge.challengeId });
        expect(result).toMatchObject({ allowed: false, code: "usage_limit_reached" });
        expect((await transaction.execute(sql`select id from public.messaging_usage_events where event_type='code_request' and tribe_id=${challenge.scope.tribeId}`)).rows).toHaveLength(0);
        expect((await transaction.execute<{ total: number }>(sql`select count(*)::integer as total from public.messaging_usage_events where event_type='diagnostic_request' and tribe_id=${challenge.scope.tribeId}`)).rows[0].total).toBe(10);
      });
    });
  }, 180_000);
});
