/** @vitest-environment node */
/** Exercises current country facts through the admission port on real guarded PostgreSQL transactions. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { AdmissionMessagingUsagePolicyReader } from "@/src/modules/academy-admissions/infrastructure/verification/messaging-usage-policy-reader";
import { PostgresMessagingUsageRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Builds isolated tribes and only the shipped persistence required by this reader. */
async function prepareCountries(database: AcademyAdmissionTestDatabase) {
  for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql"]) await database.applyMigration(migration);
  const actorId = randomUUID(), tribeId = randomUUID(), foreignTribeId = randomUUID();
  const own = { userId: actorId, email: null };
  await database.withContext(own, async (transaction) => {
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${actorId},'Synthetic country reader',${`${actorId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    for (const id of [tribeId, foreignTribeId]) await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${id},'Synthetic country scope',${`country-reader-${id}`},${actorId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${actorId},'leader','active')`);
    await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,allowed_countries) values (${foreignTribeId},ARRAY['US'])`);
  });
  const authorize = async (transaction: RequestDatabase, requestedTribe: string) => Boolean((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${requestedTribe} and user_id=public.current_app_user_id() and role='leader' and status='active' for share`)).rows[0]);
  return { own, actorId, tribeId, foreignTribeId, authorize };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission messaging country reader", () => {
  it("should read absence and the current configuration without creating policy or requiring a connection", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCountries(database);
      await database.withContext(fixture.own, async (transaction) => {
        const reader = new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(transaction, fixture.authorize));
        expect(await reader.readForTribe(fixture.tribeId)).toBeNull();
        expect((await transaction.execute(sql`select tribe_id from public.messaging_usage_policies where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
        await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id) values (${fixture.tribeId})`);
        expect(await reader.readForTribe(fixture.tribeId)).toEqual({ tribeId: fixture.tribeId, version: 1, allowedCountries: [], platformRestrictions: [] });
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.tribeId}`);
        expect(await reader.readForTribe(fixture.tribeId)).toEqual({ tribeId: fixture.tribeId, version: 2, allowedCountries: ["AR"], platformRestrictions: [] });
        expect((await transaction.execute(sql`select id from public.tenant_messaging_connections where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
      });
    });
  }, 120_000);

  it("should deny a foreign tribe and changed leadership before disclosing its countries", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCountries(database);
      await database.withContext(fixture.own, async (transaction) => {
        const reader = new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(transaction, fixture.authorize));
        await expect(reader.readForTribe(fixture.foreignTribeId)).rejects.toMatchObject({ code: "permission_denied" });
        await transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.actorId}`);
        await expect(reader.readForTribe(fixture.tribeId)).rejects.toMatchObject({ code: "permission_denied" });
      });
    });
  }, 120_000);

  it("should project checked restrictions only from the currently selected resource version", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCountries(database), connectionId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,allowed_countries) values (${fixture.tribeId},ARRAY['AR'])`);
        await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_selected,is_candidate,selected_version,candidate_version) values (${connectionId},${fixture.tribeId},${fixture.actorId},'active','synthetic','synthetic',true,false,1,null)`);
        for (const version of [1, 2]) await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,sms_sender_id) values (${connectionId},${fixture.tribeId},${version},'synthetic','synthetic','synthetic-sender')`);
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,checked_at,platform_restrictions) values (${fixture.tribeId},${connectionId},1,'sms','synthetic-sender',clock_timestamp(),'[{"country":"AR","channel":"sms","allowed":false}]'),(${fixture.tribeId},${connectionId},2,'sms','synthetic-sender',clock_timestamp(),'[{"country":"US","channel":"sms","allowed":false}]')`);
        const reader = new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(transaction, fixture.authorize));
        expect(await reader.readForTribe(fixture.tribeId)).toEqual({ tribeId: fixture.tribeId, version: 1, allowedCountries: ["AR"], platformRestrictions: [{ country: "AR", channel: "sms", allowed: false }] });
        await transaction.execute(sql`update public.tenant_messaging_connections set selected_version=2,version=version+1 where id=${connectionId}`);
        expect((await reader.readForTribe(fixture.tribeId))?.platformRestrictions).toEqual([{ country: "US", channel: "sms", allowed: false }]);
      });
    });
  }, 120_000);

  it("should revalidate a time-sensitive permission after reading the locked country facts", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCountries(database);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,allowed_countries) values (${fixture.tribeId},ARRAY['AR'])`);
        let checks = 0;
        const reader = new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(transaction, async (currentDatabase, tribeId) => {
          checks += 1;
          return checks === 1 && await fixture.authorize(currentDatabase, tribeId);
        }));
        await expect(reader.readForTribe(fixture.tribeId)).rejects.toMatchObject({ code: "permission_denied" });
        expect((await transaction.execute(sql`select allowed_countries,version from public.messaging_usage_policies where tribe_id=${fixture.tribeId}`)).rows[0]).toEqual({ allowed_countries: ["AR"], version: 1 });
      });
    });
  }, 120_000);

  it("should close configuration when a recognized stored restriction cannot be consumed safely", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCountries(database), connectionId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,allowed_countries) values (${fixture.tribeId},ARRAY['AR'])`);
        await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_selected,is_candidate,selected_version,candidate_version) values (${connectionId},${fixture.tribeId},${fixture.actorId},'active','synthetic','synthetic',true,false,1,null)`);
        await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,sms_sender_id) values (${connectionId},${fixture.tribeId},1,'synthetic','synthetic','synthetic-sender')`);
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,checked_at,platform_restrictions) values (${fixture.tribeId},${connectionId},1,'sms','synthetic-sender',clock_timestamp(),'[{"country":"AR","channel":"sms","allowed":"false"}]')`);
        const reader = new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(transaction, fixture.authorize));
        await expect(reader.readForTribe(fixture.tribeId)).rejects.toMatchObject({ code: "resource_unavailable" });
      });
    });
  }, 120_000);

  it("should keep candidate restrictions scoped to its exact live version without replacing admission's selected facts", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCountries(database);
      const selectedId = randomUUID(), candidateId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,allowed_countries) values (${fixture.tribeId},ARRAY['AR','US'])`);
        await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_selected,is_candidate,selected_version,candidate_version) values (${selectedId},${fixture.tribeId},${fixture.actorId},'active','synthetic','synthetic',true,false,1,null),(${candidateId},${fixture.tribeId},${fixture.actorId},'draft','synthetic','synthetic',false,true,null,1)`);
        for (const connectionId of [selectedId, candidateId]) {
          await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,sms_sender_id) values (${connectionId},${fixture.tribeId},1,'synthetic','synthetic','synthetic-sender')`);
        }
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,checked_at,platform_restrictions) values (${fixture.tribeId},${selectedId},1,'sms','synthetic-sender',clock_timestamp(),'[{"country":"AR","channel":"sms","allowed":false}]'),(${fixture.tribeId},${candidateId},1,'sms','synthetic-sender',clock_timestamp(),'[{"country":"US","channel":"sms","allowed":false}]')`);
        const messaging = new PostgresMessagingUsageRepository(transaction, fixture.authorize);
        const admission = new AdmissionMessagingUsagePolicyReader(messaging);
        expect((await admission.readForTribe(fixture.tribeId))?.platformRestrictions).toEqual([{ country: "AR", channel: "sms", allowed: false }]);
        expect((await messaging.readCountryPolicyForConnection({ tribeId: fixture.tribeId, connectionId: candidateId, connectionVersion: 1, slot: "candidate" }))?.platformRestrictions).toEqual([{ country: "US", channel: "sms", allowed: false }]);
        await expect(messaging.readCountryPolicyForConnection({ tribeId: fixture.tribeId, connectionId: candidateId, connectionVersion: 1, slot: "selected" })).rejects.toMatchObject({ code: "resource_unavailable" });
        await expect(messaging.readCountryPolicyForConnection({ tribeId: fixture.foreignTribeId, connectionId: candidateId, connectionVersion: 1, slot: "candidate" })).rejects.toMatchObject({ code: "permission_denied" });
        await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,sms_sender_id) values (${candidateId},${fixture.tribeId},2,'synthetic','synthetic','synthetic-sender')`);
        await transaction.execute(sql`update public.tenant_messaging_connections set candidate_version=2,version=version+1 where id=${candidateId}`);
        await expect(messaging.readCountryPolicyForConnection({ tribeId: fixture.tribeId, connectionId: candidateId, connectionVersion: 1, slot: "candidate" })).rejects.toMatchObject({ code: "resource_unavailable" });
        expect((await admission.readForTribe(fixture.tribeId))?.platformRestrictions).toEqual([{ country: "AR", channel: "sms", allowed: false }]);
      });
    });
  }, 120_000);
});
