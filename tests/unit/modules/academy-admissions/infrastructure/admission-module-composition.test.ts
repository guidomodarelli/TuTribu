/** @vitest-environment node */
/** Exercises request composition with actual account/session SQL and protected feature transactions. @module admission-module-composition-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer, contactVerificationIssuanceSnapshotSchema } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { VERIFICATION_ISSUANCE_OPERATION } from "@/src/modules/academy-admissions/constants/verification-issuance";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission module composition", () => {
  it("should resolve the current leader under one feature transaction, deny foreign scope and refresh revoked authority", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database);
      await database.applyMigration("20261005095000_guard_global_identity_context.sql");
      const sessionId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`));
      let insideFeatureTransaction = false;
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId }), async (identity, run) => {
        expect(insideFeatureTransaction).toBe(false);
        return database.withContext({ userId: identity.userId, email: fixture.own.email }, run);
      });
      const admissionModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: async (account, run) => {
        insideFeatureTransaction = true;
        try { return await database.withContext({ userId: account.userId, email: account.normalizedEmail }, run); }
        finally { insideFeatureTransaction = false; }
      } });
      const command = { tribeId: fixture.scope.tribeId, action: ADMISSION_ACTION.manageAllowlist, requestId: randomUUID() };
      expect(await admissionModule.useCases.resolveContext.execute(command)).toMatchObject({ allowed: true, context: { userId: fixture.userId, sessionId } });
      expect(await admissionModule.useCases.resolveContext.execute({ ...command, tribeId: randomUUID() })).toMatchObject({ allowed: false });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.scope.tribeId} and user_id=${fixture.userId}`));
      expect(await admissionModule.useCases.resolveContext.execute(command)).toMatchObject({ allowed: false, failure: { code: "permission_denied" } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${sessionId}`));
      expect(await admissionModule.useCases.resolveContext.execute(command)).toMatchObject({ allowed: false, failure: { code: "authentication_required" } });
    });
  }, 180_000);

  it("should recover only an actually recorded own operation without claiming new work or mixing accounts", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database);
      await database.applyMigration("20261005095000_guard_global_identity_context.sql");
      const sessionId = randomUUID(), operationId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`));
      const issued = await fixture.issue(null, operationId);
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId }), (identity, run) => database.withContext({ userId: identity.userId, email: fixture.own.email }, run));
      const admissionModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) });
      const resolver = admissionModule.createOperationResolver({ readSecurityConfig: async () => fixture.config, resultSchema: contactVerificationIssuanceSnapshotSchema, authorize: async (transaction, command) => Boolean((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${command.tribeId} and user_id=public.current_app_user_id() and role='leader' and status='active' for share`)).rows[0]) });
      const command = { tribeId: fixture.scope.tribeId, operationType: VERIFICATION_ISSUANCE_OPERATION.issue, idempotencyKey: operationId, intent: { expectedCurrentChallengeId: null, contact: fixture.scope.contact.value, channel: fixture.scope.channel, purpose: fixture.scope.purpose, connectionId: fixture.scope.connectionId, connectionVersion: 1 } };
      expect(await resolver.execute(command)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: issued.state === "completed" ? issued.result : undefined } });
      expect(await resolver.execute({ ...command, idempotencyKey: randomUUID() })).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_operations where tribe_id=${fixture.scope.tribeId}`)).rows)).toEqual([{ total: 1 }]);
    });
  }, 180_000);

  it("should deny a different country-policy tenant through transaction collaborators even when the fixed scope is authorized", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database);
      const foreignTribeId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${foreignTribeId},'Synthetic foreign country tribe',${`foreign-composition-${foreignTribeId}`},${fixture.userId})`);
        await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,allowed_countries) values (${foreignTribeId},ARRAY['US'])`);
        const admissionModule = buildAcademyAdmissionsModule({ accounts: { getAuthenticatedAccount: async () => null }, execute: (_account, run) => run(transaction), clock: () => new Date() });
        const collaborators = admissionModule.createVerificationCollaborators(transaction, { scope: fixture.scope, readSecurityConfig: async () => fixture.config, authorize: async (current, scope) => Boolean((await current.execute(sql`select id from public.tribe_members where tribe_id=${scope.tribeId} and user_id=public.current_app_user_id() and role='leader' and status='active' for share`)).rows[0]) });
        await expect(collaborators.countries.readForTribe(foreignTribeId)).rejects.toMatchObject({ code: "permission_denied" });
      });
    });
  }, 180_000);
});
