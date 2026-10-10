/** @vitest-environment node */
/** Exercises diagnostic/code/capability/ledger atomicity with real SQL and Web Crypto, without a provider request. @module connection-diagnostic-verification-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer, recoverTestVerificationCode, advanceVerificationRequestCooldown, contactVerificationIssuanceSnapshotSchema } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresContactVerificationIssuer } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-contact-verification-issuer";
import { PostgresVerificationRequestBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-request-budget";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import type { VerificationFailureBudget } from "@/src/modules/academy-admissions/domain/repositories/verification-failure-budget";
import { VERIFICATION_ISSUANCE_OPERATION } from "@/src/modules/academy-admissions/constants/verification-issuance";
import { PostgresConnectionDiagnosticOperations } from "@/src/modules/messaging/infrastructure/repositories/postgres-connection-diagnostic-operations";
import { PostgresConnectionDiagnosticRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-connection-diagnostic-repository";
import { PostgresContactVerificationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-contact-verification-repository";
import { PostgresVerificationFailureBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-failure-budget";
import { authorizeConnectionDiagnostic } from "@/src/modules/messaging/infrastructure/repositories/postgres-connection-diagnostic-authorizer";
import { VerifyConnectionDiagnosticUseCase } from "@/src/modules/messaging/application/use-cases/connection-diagnostic-use-cases";
import { connectionDiagnosticSnapshotSchema, projectConnectionDiagnosticSnapshot } from "@/src/modules/messaging/application/results/connection-diagnostic-result";
import { CONNECTION_DIAGNOSTIC_VERIFY_OPERATION } from "@/src/modules/messaging/constants/connection-diagnostic";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import {prepareContactVerificationDatabase,seedContactVerificationChallenge} from "@/tests/support/contact-verification-database-fixture";

/**
 * Creates a real issued diagnostic and trusted synthetic global identity/recency, not a real Google login.
 * @param database - Owned disposable branch with the actual shipped migrations.
 * @param phone - Whether to configure the SMS country before the explicit diagnostic issue.
 * @returns The exact private resource/code/context and real operation composition.
 */
async function prepareDiagnostic(database: AcademyAdmissionTestDatabase, phone = false) {
  const fixture = await prepareContactVerificationIssuer(database, "connection_diagnostic", phone);
  await database.applyMigration("20261005095000_guard_global_identity_context.sql");
  await database.applyMigration("20261005100000_guard_messaging_secret_retirement.sql");
  if (phone) await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.scope.tribeId}`));
  const issued = await fixture.issue();
  if (issued.state !== "completed" || issued.result.outcome !== "issued" || !issued.result.diagnosticId) throw new Error("Synthetic diagnostic issuance did not complete");
  const original = issued.result;
  const { code } = await recoverTestVerificationCode(database, fixture, original.challengeId);
  const accountId = randomUUID(), sessionId = randomUUID(), subject = randomUUID(), intentId = randomUUID();
  const context = await database.withContext(fixture.own, async (transaction): Promise<AuthorizedMessagingContext> => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    const validUntil = new Date(now.getTime()+540_000);
    const secretRef = (await transaction.execute<{ secret_ref: string }>(sql`select secret_ref from public.messaging_connection_versions where connection_id=${fixture.scope.connectionId} and version=1`)).rows[0].secret_ref;
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},${new Date(now.getTime()+3_600_000)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
    await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${sessionId},${accountId},${subject},${fixture.scope.tribeId},${CONNECTION_DIAGNOSTIC_VERIFY_OPERATION},${fixture.scope.connectionId},'/synthetic-diagnostic',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
    await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${accountId},${subject},${sessionId},${fixture.scope.tribeId},${CONNECTION_DIAGNOSTIC_VERIFY_OPERATION},${fixture.scope.connectionId},${now},${now},${validUntil})`);
    return { authorizationPurpose: "sensitive_leader", actorUserId: fixture.userId, sessionId, accountId, subject, tribeId: fixture.scope.tribeId, connectionId: fixture.scope.connectionId, connectionVersion: 1, environment: fixture.config.environment, securityEpoch: fixture.config.securityEpoch, operation: CONNECTION_DIAGNOSTIC_VERIFY_OPERATION, requestId: randomUUID(), resourceId: fixture.scope.connectionId, secretRef, authenticatedAt: now, validUntil };
  });
  const operations = new PostgresConnectionDiagnosticOperations((_context, run) => database.withContext(fixture.own, run), async () => fixture.config);
  const verify = (operationId = randomUUID(), submittedCode = code, currentContext = context) => operations.verify({ context: currentContext, operationId, diagnosticId: original.diagnosticId!, code: submittedCode });
  return { ...fixture, original, code, context, operations, verify };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("connection diagnostic verification", () => {
  it("should reject an expired diagnostic through its own ledger without preparing a capability, consuming a failure or granting a proof",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareContactVerificationDatabase(database);await database.applyMigration("20261005095000_guard_global_identity_context.sql");
      const instant=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now),secretRef=randomUUID(),challenge=await seedContactVerificationChallenge(database,fixture,"connection_diagnostic",new Date(new Date(instant).getTime()-660_000),{secretRef,senderId:"synthetic-expired-sender"}),diagnosticId=challenge.challengeId,accountId=randomUUID(),sessionId=randomUUID(),subject=randomUUID(),intentId=randomUUID();
      const context=await database.withContext(fixture.own,async(transaction):Promise<AuthorizedMessagingContext>=>{
        const now=new Date((await transaction.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now),validUntil=new Date(now.getTime()+540_000);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${challenge.scope.tribeId},${fixture.userId},'leader','active')`);
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,state,checked_at) values (${challenge.scope.tribeId},${challenge.scope.connectionId},1,'email','synthetic-expired-sender','unprepared',${now})`);
        await transaction.execute(sql`insert into public.messaging_connection_diagnostics(id,tribe_id,connection_id,connection_version,leader_user_id,challenge_id,channel,sender_id) values (${diagnosticId},${challenge.scope.tribeId},${challenge.scope.connectionId},1,${fixture.userId},${challenge.challengeId},'email','synthetic-expired-sender')`);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},${new Date(now.getTime()+3_600_000)},${now},${now})`);
        await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
        await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${sessionId},${accountId},${subject},${challenge.scope.tribeId},${CONNECTION_DIAGNOSTIC_VERIFY_OPERATION},${challenge.scope.connectionId},'/synthetic-expired-diagnostic',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
        await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${accountId},${subject},${sessionId},${challenge.scope.tribeId},${CONNECTION_DIAGNOSTIC_VERIFY_OPERATION},${challenge.scope.connectionId},${now},${now},${validUntil})`);
        return{authorizationPurpose:"sensitive_leader",actorUserId:fixture.userId,sessionId,accountId,subject,tribeId:challenge.scope.tribeId,connectionId:challenge.scope.connectionId,connectionVersion:1,environment:fixture.config.environment,securityEpoch:fixture.config.securityEpoch,operation:CONNECTION_DIAGNOSTIC_VERIFY_OPERATION,requestId:randomUUID(),resourceId:challenge.scope.connectionId,secretRef,authenticatedAt:now,validUntil};
      });
      const operations=new PostgresConnectionDiagnosticOperations((_context,run)=>database.withContext(fixture.own,run),async()=>fixture.config),operationId=randomUUID(),command={context,operationId,diagnosticId,code:challenge.code};
      expect(await operations.verify(command)).toMatchObject({state:"completed",result:{outcome:"denied",code:"challenge_expired"}});expect(await operations.verify(command)).toMatchObject({state:"completed",replayed:true,result:{outcome:"denied",code:"challenge_expired"}});
      const state=await database.withContext(fixture.own,async(transaction)=>({capability:(await transaction.execute(sql`select state,tested_at from public.messaging_connection_capabilities where connection_id=${challenge.scope.connectionId}`)).rows[0],diagnostic:(await transaction.execute(sql`select outcome,validated_at from public.messaging_connection_diagnostics where id=${diagnosticId}`)).rows[0],failures:(await transaction.execute<{count:number}>(sql`select count(*)::int as count from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_failure'`)).rows[0].count,proofs:(await transaction.execute<{count:number}>(sql`select count(*)::int as count from public.academy_admission_verification_proofs where challenge_id=${challenge.challengeId}`)).rows[0].count}));
      expect(state).toEqual({capability:{state:"unprepared",tested_at:null},diagnostic:{outcome:"pending",validated_at:null},failures:0,proofs:0});
    });
  },300_000);
  it("should serialize SMS verification against a WhatsApp resend without a diagnostic/challenge lock inversion", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareDiagnostic(database, true);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,checked_at) values (${fixture.scope.tribeId},${fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es',clock_timestamp())`));
      await advanceVerificationRequestCooldown(database, fixture);
      const verifierAtAccountLock = Promise.withResolvers<number>();
      const resendStarted = Promise.withResolvers<number>();
      const releaseVerifier = Promise.withResolvers<void>();
      const verificationId = randomUUID(), resendId = randomUUID();
      const verification = fixture.ledger.run({ actorUserId: fixture.userId, tribeId: fixture.scope.tribeId, operationType: CONNECTION_DIAGNOSTIC_VERIFY_OPERATION, idempotencyKey: verificationId, intent: { diagnosticId: fixture.original.diagnosticId!, code: fixture.code } }, connectionDiagnosticSnapshotSchema, async (transaction, ledgerId) => {
        const failures = new PostgresVerificationFailureBudget(transaction);
        let announced = false;
        // Own budget ports establish the real conflicting SQL lock phases; no pg or SDK mock is used.
        const coordinatedFailures: VerificationFailureBudget = {
          async lockAccount(userId) { await failures.lockAccount(userId); if (!announced) { announced = true; verifierAtAccountLock.resolve((await transaction.execute<{pid:number}>(sql`select pg_backend_pid() as pid`)).rows[0].pid); await releaseVerifier.promise; } },
          readRecordedFailure: (identity) => failures.readRecordedFailure(identity),
          hasCapacity: (userId, now) => failures.hasCapacity(userId, now),
          recordFailure: (identity, now) => failures.recordFailure(identity, now),
        };
        const verifier = new PostgresContactVerificationRepository(transaction, async (current) => { await authorizeConnectionDiagnostic(current, fixture.context, async () => fixture.config); return true; }, async () => fixture.config, coordinatedFailures);
        return projectConnectionDiagnosticSnapshot(await new PostgresConnectionDiagnosticRepository(transaction, async () => fixture.config, verifier, coordinatedFailures).verify({ context: fixture.context, diagnosticId: fixture.original.diagnosticId!, operationId: verificationId, ledgerId, code: fixture.code }));
      });
      const verifierPid = await verifierAtAccountLock.promise;
      const whatsappScope = { ...fixture.scope, channel: "whatsapp" as const };
      const resend = fixture.ledger.run({ actorUserId: fixture.userId, tribeId: fixture.scope.tribeId, operationType: VERIFICATION_ISSUANCE_OPERATION.resend, idempotencyKey: resendId, intent: { currentChallengeId: fixture.original.challengeId, channel: "whatsapp" } }, contactVerificationIssuanceSnapshotSchema, async (transaction, ledgerId) => {
        resendStarted.resolve((await transaction.execute<{pid:number}>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
        const contacts = new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config);
        const requests = new PostgresVerificationRequestBudget(transaction, async () => true, contacts);
        const issued = await new PostgresContactVerificationIssuer(transaction, async () => true, async () => fixture.config, requests).issue({ scope: whatsappScope, operationId: resendId, ledgerId, expectedCurrentChallengeId: fixture.original.challengeId });
        return issued.outcome === "issued" ? { ...issued, expiresAt: issued.expiresAt.toISOString(), resendAllowedAt: issued.resendAllowedAt.toISOString() } : issued;
      });
      const resendPid = await resendStarted.promise;
      try {
        let observedWait = false;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const blockers = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{blockers:number[]}>(sql`select pg_blocking_pids(${resendPid}) as blockers`)).rows[0].blockers);
          if (blockers.includes(verifierPid)) { observedWait = true; break; }
          await delay(50);
        }
        expect(observedWait).toBe(true);
      } finally { releaseVerifier.resolve(); }
      const results = await Promise.allSettled([verification, resend]);
      const outcomes = results.map((result) => {
        if (result.status === "fulfilled") return { status: result.status };
        const codes: string[] = [];
        const inspected = new Set<object>();
        let error: unknown = result.reason;
        while (typeof error === "object" && error !== null && !inspected.has(error)) {
          inspected.add(error);
          if ("code" in error && typeof error.code === "string") codes.push(error.code);
          error = "cause" in error ? error.cause : undefined;
        }
        return { status: result.status, codes };
      });
      expect(outcomes).toEqual([{ status: "fulfilled" }, { status: "fulfilled" }]);
      if (results[0].status !== "fulfilled" || results[1].status !== "fulfilled") throw new Error("Synthetic cross-channel operations did not both complete");
      expect(results[0].value).toMatchObject({ state: "completed", result: { outcome: "verified" } });
      expect(results[1].value).toMatchObject({ state: "completed", result: { outcome: "issued" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select outcome from public.messaging_connection_diagnostics where id=${fixture.original.diagnosticId}`)).rows).toEqual([{ outcome: "verified" }]);
        expect((await transaction.execute(sql`select channel from public.contact_verification_challenges where tribe_id=${fixture.scope.tribeId} and is_current`)).rows).toEqual([{ channel: "whatsapp" }]);
        expect((await transaction.execute(sql`select state,tested_at from public.messaging_connection_capabilities where connection_id=${fixture.scope.connectionId} and channel='sms'`)).rows).toEqual([{ state: "prepared", tested_at: expect.anything() }]);
        expect((await transaction.execute(sql`select id from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_failure'`)).rows).toEqual([]);
      });
    });
  }, 240_000);

  it("should confirm only the exact channel with its local code and ledger result, preserving historical replay and global identity", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareDiagnostic(database);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id) values (${fixture.scope.tribeId},${fixture.scope.connectionId},1,'sms','synthetic-sms-sender')`));
      // The own resolver double supplies a trusted fixture context; real SQL independently rechecks every authority relationship.
      const useCase = new VerifyConnectionDiagnosticUseCase({ execute: async () => ({ allowed: true as const, context: fixture.context }) }, fixture.operations);
      const operationId = randomUUID();
      const input = { tribeId: fixture.scope.tribeId, connectionId: fixture.scope.connectionId, diagnosticId: fixture.original.diagnosticId!, operationId, code: fixture.code, requestId: randomUUID() };
      const first = await useCase.execute(input);
      if (!first.ok || first.value.state !== "completed" || first.value.result.outcome !== "verified") throw new Error("Synthetic local diagnostic did not complete");
      const snapshot = first.value.result;
      expect(snapshot).toMatchObject({ diagnosticId: fixture.original.diagnosticId, connectionVersion: 1, channel: "email", capabilityState: "prepared" });
      expect(Object.keys(snapshot).sort()).toEqual(["outcome","diagnosticId","connectionVersion","channel","validatedAt","capabilityState"].sort());
      await database.withContext(fixture.own, async (transaction) => {
        const diagnostic = (await transaction.execute<{ outcome: string; validated_at: string | Date }>(sql`select outcome,validated_at from public.messaging_connection_diagnostics where id=${fixture.original.diagnosticId}`)).rows[0];
        expect(diagnostic.outcome).toBe("verified");
        expect(new Date(diagnostic.validated_at instanceof Date ? diagnostic.validated_at.getTime() : diagnostic.validated_at).toISOString()).toBe(snapshot.validatedAt);
        expect((await transaction.execute(sql`select channel,state,tested_at is not null as tested from public.messaging_connection_capabilities where connection_id=${fixture.scope.connectionId} order by channel`)).rows).toEqual([{ channel: "email", state: "prepared", tested: true }, { channel: "sms", state: "unprepared", tested: false }]);
        expect((await transaction.execute(sql`select state,code_mac,code_envelope_id from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual([{ state: "verified", code_mac: null, code_envelope_id: null }]);
        expect((await transaction.execute(sql`select id from public.academy_admission_verification_proofs where challenge_id=${fixture.original.challengeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select "emailVerified" from public."user" where id=${fixture.userId}`)).rows).toEqual([{ emailVerified: false }]);
        expect((await transaction.execute(sql`select public_result from public.academy_admission_operations where idempotency_key=${operationId}`)).rows).toEqual([{ public_result: snapshot }]);
        await transaction.execute(sql`update public.messaging_connection_capabilities set state='unavailable' where connection_id=${fixture.scope.connectionId} and channel='email'`);
      });
      expect(await useCase.execute(input)).toEqual({ ok: true, value: { ...first.value, replayed: true } });
      await database.withContext(fixture.own, async (transaction) => expect((await transaction.execute(sql`select state from public.messaging_connection_capabilities where connection_id=${fixture.scope.connectionId} and channel='email'`)).rows).toEqual([{ state: "unavailable" }]));
    });
  }, 240_000);

  it("should count each wrong operation once and close the diagnostic after the fifth failure without preparing its capability", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareDiagnostic(database);
      const wrongCode = `${fixture.code[0] === "0" ? "1" : "0"}${fixture.code.slice(1)}`;
      const firstId = randomUUID();
      const first = await fixture.verify(firstId, wrongCode);
      expect(first).toMatchObject({ state: "completed", result: { outcome: "denied", code: "verification_code_incorrect" } });
      expect(await fixture.verify(firstId, wrongCode)).toEqual({ ...first, replayed: true });
      for (let attempt = 1; attempt < 5; attempt += 1) expect(await fixture.verify(randomUUID(), wrongCode)).toMatchObject({ state: "completed", result: { outcome: "denied", code: attempt === 4 ? "verification_attempts_exceeded" : "verification_code_incorrect" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select outcome,validated_at from public.messaging_connection_diagnostics where id=${fixture.original.diagnosticId}`)).rows).toEqual([{ outcome: "failed", validated_at: null }]);
        expect((await transaction.execute(sql`select state,failed_attempts,code_envelope_id from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual([{ state: "invalidated", failed_attempts: 5, code_envelope_id: null }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_failure'`)).rows).toEqual([{ total: 5 }]);
        expect((await transaction.execute(sql`select state,tested_at from public.messaging_connection_capabilities where connection_id=${fixture.scope.connectionId}`)).rows).toEqual([{ state: "unprepared", tested_at: null }]);
      });
    });
  }, 240_000);

  it("should deny crossed current identity, resource, action, expired session and guardian authority before consuming the code", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareDiagnostic(database);
      for (const changed of [{ actorUserId: randomUUID() }, { sessionId: randomUUID() }, { accountId: randomUUID() }, { subject: randomUUID() }, { tribeId: randomUUID() }, { connectionId: randomUUID() }, { connectionVersion: 2 }, { operation: "diagnose_messaging_connection" }, { resourceId: randomUUID() }]) await expect(fixture.verify(randomUUID(), fixture.code, { ...fixture.context, ...changed })).rejects.toMatchObject({ code: expect.stringMatching(/^(permission_denied|authentication_required|reauthentication_required|resource_unavailable)$/) });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.scope.tribeId} and user_id=${fixture.userId}`));
      await expect(fixture.verify()).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${fixture.scope.tribeId} and user_id=${fixture.userId}`);
        await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp() where id=${fixture.context.sessionId}`);
      });
      await expect(fixture.verify()).rejects.toMatchObject({ code: "reauthentication_required" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,failed_attempts,code_envelope_id is not null as recoverable from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual([{ state: "issued", failed_attempts: 0, recoverable: true }]);
        expect((await transaction.execute(sql`select outcome from public.messaging_connection_diagnostics where id=${fixture.original.diagnosticId}`)).rows).toEqual([{ outcome: "pending" }]);
        expect((await transaction.execute(sql`select id from public.messaging_usage_events where event_type='code_failure' and actor_user_id=${fixture.userId}`)).rows).toEqual([]);
      });
    });
  }, 240_000);

  it("should roll back code, envelope, diagnostic and capability together when recovery closes after local consumption", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareDiagnostic(database);
      const operationId = randomUUID();
      await expect(fixture.ledger.run({ actorUserId: fixture.userId, tribeId: fixture.scope.tribeId, operationType: CONNECTION_DIAGNOSTIC_VERIFY_OPERATION, idempotencyKey: operationId, intent: { diagnosticId: fixture.original.diagnosticId!, code: fixture.code } }, connectionDiagnosticSnapshotSchema, async (transaction, ledgerId) => {
        // The own hosting-reader double flips external recovery after observing the actual local consumption in this same transaction.
        const configuration = async () => {
          const row = (await transaction.execute<{ state: string }>(sql`select state from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows[0];
          return { ...fixture.config, recoveryLocked: row.state === "verified" };
        };
        const failures = new PostgresVerificationFailureBudget(transaction);
        const verifier = new PostgresContactVerificationRepository(transaction, async (database) => { await authorizeConnectionDiagnostic(database, fixture.context, configuration); return true; }, async () => fixture.config, failures);
        return projectConnectionDiagnosticSnapshot(await new PostgresConnectionDiagnosticRepository(transaction, configuration, verifier, failures).verify({ context: fixture.context, diagnosticId: fixture.original.diagnosticId!, operationId, ledgerId, code: fixture.code }));
      })).rejects.toMatchObject({ code: "operation_unresolved", operationId });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,code_mac is not null as verifiable,code_envelope_id is not null as recoverable from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual([{ state: "issued", verifiable: true, recoverable: true }]);
        expect((await transaction.execute(sql`select id from public.verification_code_envelopes where challenge_id=${fixture.original.challengeId}`)).rows).toHaveLength(1);
        expect((await transaction.execute(sql`select outcome,validated_at from public.messaging_connection_diagnostics where id=${fixture.original.diagnosticId}`)).rows).toEqual([{ outcome: "pending", validated_at: null }]);
        expect((await transaction.execute(sql`select state,tested_at from public.messaging_connection_capabilities where connection_id=${fixture.scope.connectionId}`)).rows).toEqual([{ state: "unprepared", tested_at: null }]);
        expect((await transaction.execute(sql`select state,public_result from public.academy_admission_operations where idempotency_key=${operationId}`)).rows).toEqual([{ state: "started", public_result: null }]);
      });
    });
  }, 240_000);

  it("should confirm only one concurrent verifier and preserve a phone code after country removal and provider unavailability", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareDiagnostic(database, true);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries='{}',version=version+1 where tribe_id=${fixture.scope.tribeId}`);
        await transaction.execute(sql`update public.messaging_connection_capabilities set state='unavailable' where connection_id=${fixture.scope.connectionId}`);
      });
      const responses = await Promise.all([fixture.verify(), fixture.verify()]);
      expect(responses.filter((response) => response.state === "completed" && response.result.outcome === "verified")).toHaveLength(1);
      expect(responses.filter((response) => response.state === "completed" && response.result.outcome === "denied")).toHaveLength(1);
      expect(responses).toContainEqual(expect.objectContaining({ state: "completed", result: expect.objectContaining({ outcome: "verified", channel: "sms", capabilityState: "unavailable" }) }));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,tested_at is not null as tested from public.messaging_connection_capabilities where connection_id=${fixture.scope.connectionId}`)).rows).toEqual([{ state: "unavailable", tested: true }]);
        expect((await transaction.execute(sql`select outcome from public.messaging_connection_diagnostics where id=${fixture.original.diagnosticId}`)).rows).toEqual([{ outcome: "verified" }]);
        expect((await transaction.execute(sql`select id from public.academy_admission_verification_proofs where challenge_id=${fixture.original.challengeId}`)).rows).toEqual([]);
      });
    });
  }, 240_000);
});
