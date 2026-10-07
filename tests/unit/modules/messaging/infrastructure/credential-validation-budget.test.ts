/** @vitest-environment node */
/**
 * Exercises durable credential-validation usage with actual identity, recency and resource guards.
 *
 * @module credential-validation-budget-tests
 */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer } from "@/tests/support/contact-verification-issuance-fixture";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { PostgresCredentialValidationBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-credential-validation-budget";
import { ReserveMessagingUsageUseCase } from "@/src/modules/messaging/application/use-cases/reserve-messaging-usage-use-case";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Seeds trusted synthetic global recency for an existing resource without an OAuth or provider request.
 * @param database - Disposable branch owned by this test.
 * @param applyUsageMigration - Whether to install the new guard before seeding, or test a historical upgrade.
 * @returns A live private context and the real usage composition.
 */
async function prepareCredentialValidation(database: AcademyAdmissionTestDatabase, applyUsageMigration = true) {
  const fixture = await prepareContactVerificationIssuer(database);
  await database.applyMigration("20261005095000_guard_global_identity_context.sql");
  await database.applyMigration("20261005100000_guard_messaging_secret_retirement.sql");
  if (applyUsageMigration) await database.applyMigration("20261006230000_bind_credential_validation_usage.sql");
  const accountId = randomUUID(), sessionId = randomUUID(), subject = randomUUID(), intentId = randomUUID();
  const context = await database.withContext(fixture.own, async (transaction): Promise<AuthorizedMessagingContext> => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    const validUntil = new Date(now.getTime() + 540_000);
    const secretRef = (await transaction.execute<{ secret_ref: string }>(sql`select secret_ref from public.messaging_connection_versions where connection_id=${fixture.scope.connectionId} and version=1`)).rows[0].secret_ref;
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},${new Date(now.getTime()+3_600_000)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
    await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${sessionId},${accountId},${subject},${fixture.scope.tribeId},${REAUTHENTICATION_OPERATION.validateMessagingConnection},${fixture.scope.connectionId},'/synthetic-validation',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
    await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${accountId},${subject},${sessionId},${fixture.scope.tribeId},${REAUTHENTICATION_OPERATION.validateMessagingConnection},${fixture.scope.connectionId},${now},${now},${validUntil})`);
    return { authorizationPurpose: "sensitive_leader", actorUserId: fixture.userId, sessionId, accountId, subject, tribeId: fixture.scope.tribeId, connectionId: fixture.scope.connectionId, connectionVersion: 1, environment: fixture.config.environment, securityEpoch: fixture.config.securityEpoch, operation: REAUTHENTICATION_OPERATION.validateMessagingConnection, resourceId: fixture.scope.connectionId, requestId: randomUUID(), secretRef, authenticatedAt: now, validUntil };
  });
  const budget = new PostgresCredentialValidationBudget((current, run) => database.withContext({ userId: current.actorUserId, email: fixture.own.email }, run), async () => fixture.config);
  const reserve = (operationId = randomUUID(), current = context) => new ReserveMessagingUsageUseCase(budget, () => new Date()).execute({ context: current, operationId });
  return { ...fixture, context, budget, reserve };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("credential validation budget", () => {
  it("should count a validation once without creating a message or spending the verification quota", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCredentialValidation(database);
      const operationId = randomUUID();
      expect(await fixture.reserve(operationId)).toMatchObject({ outcome: "reserved", operationId });
      expect(await fixture.reserve(operationId)).toMatchObject({ outcome: "already_reserved", operationId });
      await database.withContext(fixture.own, async (transaction) => {
        const events = (await transaction.execute(sql`select tribe_id,actor_user_id,event_type,credential_connection_id,credential_connection_version,contact_subject_id,challenge_id,channel from public.messaging_usage_events where operation_id=${operationId}`)).rows;
        expect(events).toEqual([{ tribe_id: fixture.scope.tribeId, actor_user_id: fixture.userId, event_type: "credential_validation", credential_connection_id: fixture.scope.connectionId, credential_connection_version: 1, contact_subject_id: null, challenge_id: null, channel: null }]);
        expect((await transaction.execute(sql`select id from public.message_deliveries where tribe_id=${fixture.scope.tribeId}`)).rows).toHaveLength(0);
        expect((await transaction.execute(sql`select id from public.messaging_usage_reservations where tribe_id=${fixture.scope.tribeId}`)).rows).toHaveLength(0);
      });
    });
  }, 180_000);

  it("should let only one concurrent operation consume the tenth moving-hour slot", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCredentialValidation(database);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,purpose,event_type,operation_id,occurred_at,credential_connection_id,credential_connection_version) select ${fixture.scope.tribeId},${fixture.userId},'validate_messaging_connection','credential_validation',gen_random_uuid(),clock_timestamp()-interval '2 minutes',${fixture.scope.connectionId},1 from generate_series(1,9)`);
      });
      const results = await Promise.all([fixture.reserve(), fixture.reserve()]);
      expect(results.filter((result) => result.outcome === "reserved")).toHaveLength(1);
      expect(results.filter((result) => result.outcome === "denied")).toEqual([{ outcome: "denied", code: "credential_validation_limit_reached" }]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::integer as total from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId} and event_type='credential_validation'`)).rows)).toEqual([{ total: 10 }]);
    });
  }, 180_000);

  it("should retain tribe consumption across credential versions and reject a changed original intent", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCredentialValidation(database);
      const operationId = randomUUID();
      expect(await fixture.reserve(operationId)).toMatchObject({ outcome: "reserved" });
      const secretRef = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        const envelope = await createMessagingSecretCipher(fixture.config).seal("synthetic-rotated-credential", { tribeId: fixture.scope.tribeId, connectionId: fixture.scope.connectionId, connectionVersion: 2, resourceId: secretRef });
        await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref) values (${fixture.scope.connectionId},${fixture.scope.tribeId},2,${fixture.config.environment},${fixture.config.securityEpoch},${secretRef})`);
        await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext) values (${secretRef},${fixture.scope.tribeId},${fixture.scope.connectionId},2,${envelope.environment},${envelope.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)})`);
        await transaction.execute(sql`update public.tenant_messaging_connections set selected_version=2 where id=${fixture.scope.connectionId}`);
        await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,purpose,event_type,operation_id,occurred_at,credential_connection_id,credential_connection_version) select ${fixture.scope.tribeId},${fixture.userId},'validate_messaging_connection','credential_validation',gen_random_uuid(),clock_timestamp()-interval '2 minutes',${fixture.scope.connectionId},1 from generate_series(1,9)`);
      });
      const rotated = { ...fixture.context, connectionVersion: 2, secretRef };
      expect(await fixture.reserve(operationId, rotated)).toEqual({ outcome: "denied", code: "idempotency_conflict" });
      expect(await fixture.reserve(randomUUID(), rotated)).toEqual({ outcome: "denied", code: "credential_validation_limit_reached" });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_events set credential_connection_version=2 where operation_id=${operationId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  }, 180_000);

  it("should reject a crossed action or expired session and preserve usage outside the moving hour", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCredentialValidation(database);
      expect(await fixture.reserve(randomUUID(), { ...fixture.context, operation: REAUTHENTICATION_OPERATION.readMessagingSenders })).toEqual({ outcome: "denied", code: "permission_denied" });
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,purpose,event_type,operation_id,occurred_at,credential_connection_id,credential_connection_version) select ${fixture.scope.tribeId},${fixture.userId},'validate_messaging_connection','credential_validation',gen_random_uuid(),clock_timestamp()-interval '61 minutes',${fixture.scope.connectionId},1 from generate_series(1,10)`);
      });
      expect(await fixture.reserve()).toMatchObject({ outcome: "reserved" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.scope.tribeId} and user_id=${fixture.userId}`));
      expect(await fixture.reserve()).toEqual({ outcome: "denied", code: "permission_denied" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${fixture.scope.tribeId} and user_id=${fixture.userId}`));
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.context.sessionId}`));
      expect(await fixture.reserve()).toEqual({ outcome: "denied", code: "reauthentication_required" });
      expect((await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::integer as total from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId} and event_type='credential_validation'`)).rows))).toEqual([{ total: 11 }]);
    });
  }, 180_000);

  it("should roll back the event when external authority closes after the actual insertion", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCredentialValidation(database);
      const operationId = randomUUID();
      let transaction: RequestDatabase | null = null;
      const budget = new PostgresCredentialValidationBudget((context, run) => database.withContext({ userId: context.actorUserId, email: fixture.own.email }, async (current) => {
        transaction = current;
        try { return await run(current); } finally { transaction = null; }
      }), async () => {
        const recorded = transaction && (await transaction.execute(sql`select id from public.messaging_usage_events where operation_id=${operationId}`)).rows.length > 0;
        return recorded ? { ...fixture.config, recoveryLocked: true } : fixture.config;
      });
      expect(await budget.reserve({ context: fixture.context, operationId })).toEqual({ outcome: "denied", code: "connection_incomplete" });
      expect(await database.withContext(fixture.own, async (current) => (await current.execute(sql`select id from public.messaging_usage_events where operation_id=${operationId}`)).rows)).toHaveLength(0);
    });
  }, 180_000);

  it("should preserve committed accounting after a lost reply and recover only its original reservation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCredentialValidation(database);
      const operationId = randomUUID();
      const responseLoss = new Error("Synthetic credential usage commit reply lost");
      let loseReply = true;
      const budget = new PostgresCredentialValidationBudget(async (context, run) => {
        const result = await database.withContext({ userId: context.actorUserId, email: fixture.own.email }, run);
        if (loseReply) { loseReply = false; throw responseLoss; }
        return result;
      }, async () => fixture.config);
      await expect(budget.reserve({ context: fixture.context, operationId })).rejects.toMatchObject({ code: "operation_unresolved", cause: responseLoss });
      expect(await budget.reserve({ context: fixture.context, operationId })).toMatchObject({ outcome: "already_reserved", operationId });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::integer as total from public.messaging_usage_events where operation_id=${operationId}`)).rows)).toEqual([{ total: 1 }]);
    });
  }, 180_000);

  it("should anonymize historical unbound events without rewriting their original consumption or allowing new unbound events", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareCredentialValidation(database, false);
      const historicalActorId = randomUUID();
      const original = await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${historicalActorId},'Synthetic historical validator',${`${historicalActorId}@example.invalid`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,purpose,event_type,operation_id,occurred_at) select ${fixture.scope.tribeId},${historicalActorId},'validate_messaging_connection','credential_validation',gen_random_uuid(),clock_timestamp()-interval '2 minutes' from generate_series(1,10)`);
        return (await transaction.execute(sql`select id,tribe_id,actor_user_id,operation_id,occurred_at from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId} order by id`)).rows;
      });
      await database.applyMigration("20261006230000_bind_credential_validation_usage.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public."user" where id=${historicalActorId}`));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id,tribe_id,actor_user_id,operation_id,occurred_at from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId} order by id`)).rows)).toEqual(original.map((event) => ({ ...event, actor_user_id: null })));
      expect(await fixture.reserve()).toEqual({ outcome: "denied", code: "credential_validation_limit_reached" });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,purpose,event_type,operation_id) values (${fixture.scope.tribeId},${fixture.userId},'validate_messaging_connection','credential_validation',${randomUUID()})`))).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  }, 180_000);
});
