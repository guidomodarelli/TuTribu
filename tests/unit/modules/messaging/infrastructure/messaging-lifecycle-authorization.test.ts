/** @vitest-environment node */
/** Exercises connection-scoped local management against actual identity and leadership locks without a recoverable credential. @module messaging-lifecycle-authorization-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingConnectionCreation } from "@/tests/support/messaging-connection-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresMessagingAuthorizationReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-authorization-reader";
import { ResolveMessagingTribeManagementUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-tribe-management-use-case";
import { authorizeMessagingTribeManagement } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-authorizer";
import { PostgresMessagingConnectionSuspension } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-suspension";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("local lifecycle authority in PostgreSQL", () => {
  it("should authorize an exact suspended connection with the active session alone and reject a crossed operation, an expired session or a changed canonical leader", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingConnectionCreation(database), connectionId = randomUUID();
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,name,state,environment,security_epoch,is_selected,is_candidate,selected_version) values (${connectionId},${fixture.context.tribeId},${fixture.context.actorUserId},'Suspensión sin credencial','suspended',${fixture.fixture.config.environment},${fixture.fixture.config.securityEpoch},true,false,1)`);
        await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch) values (${connectionId},${fixture.context.tribeId},1,${fixture.fixture.config.environment},${fixture.fixture.config.securityEpoch})`);
      });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.actorUserId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.fixture.own, run));
      const resolve = () => database.withContext(fixture.fixture.own, (transaction) => new ResolveMessagingTribeManagementUseCase(accounts, new PostgresMessagingAuthorizationReader(transaction, fixture.context.sessionId, "management"), () => new Date()).execute({ tribeId: fixture.context.tribeId, connectionId, requestId: randomUUID() }, "suspend_messaging_connection"));
      const context = await resolve();
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.tenant_messaging_connections set state='active' where id=${connectionId}`));
      let compromises=0;
      const owner=new PostgresMessagingConnectionSuspension((_context,run)=>database.withContext(fixture.fixture.own,run),async()=>fixture.fixture.config,()=>({readRetirementFacts:async()=>({verificationRequired:true,admissionsPaused:false,externalNotificationsEnabled:true}),invalidateCompromisedEvidence:async()=>{compromises+=1;},retireReferences:async()=>{throw new Error("Suspension must not perform ordinary retirement");}}));
      const input={operationId:randomUUID(),expectedVersion:1,confirmed:true as const,reason:"security_stop" as const};
      const stopped=await owner.suspend(context,input);expect(stopped).toMatchObject({state:"completed",result:{id:connectionId,version:2,state:"suspended",reason:"security_stop",changed:true}});expect(compromises).toBe(0);
      expect(await owner.suspend(context,input)).toMatchObject({state:"completed",replayed:true,result:stopped.state==="completed"?stopped.result:undefined});
      await expect(owner.suspend(context,{...input,operationId:randomUUID(),expectedVersion:1})).rejects.toMatchObject({code:"connection_conflict"});
      expect(await owner.suspend(context,{...input,operationId:randomUUID(),expectedVersion:2})).toMatchObject({state:"completed",result:{version:2,changed:false}});
      const compromise={...input,operationId:randomUUID(),expectedVersion:2,reason:"suspected_compromise" as const};expect(await owner.suspend(context,compromise)).toMatchObject({state:"completed",result:{version:3,reason:"suspected_compromise",changed:true}});expect(compromises).toBe(1);
      expect(await owner.suspend(context,compromise)).toMatchObject({state:"completed",replayed:true,result:{version:3,changed:true}});expect(compromises).toBe(1);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await authorizeMessagingTribeManagement(transaction, context);
        expect((await transaction.execute(sql`select secret_ref from public.messaging_secret_envelopes where connection_id=${connectionId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select state,version,is_selected,selected_version from public.tenant_messaging_connections where id=${connectionId}`)).rows).toEqual([{ state: "suspended", version: 3, is_selected: true, selected_version: 1 }]);
      });
      await expect(database.withContext(fixture.fixture.own, (transaction) => authorizeMessagingTribeManagement(transaction, { ...context, resourceId: context.tribeId }))).rejects.toMatchObject({ code: "permission_denied" });
      await expect(database.withContext(fixture.fixture.own, (transaction) => authorizeMessagingTribeManagement(transaction, { ...context, operation: "save_messaging_credentials" }))).rejects.toMatchObject({ code: "permission_denied" });
      await expect(database.withContext(fixture.fixture.own, (transaction) => new ResolveMessagingTribeManagementUseCase(accounts, new PostgresMessagingAuthorizationReader(transaction, fixture.context.sessionId, "management"), () => new Date()).execute({ tribeId: fixture.context.tribeId, requestId: randomUUID() } as never, "suspend_messaging_connection"))).rejects.toMatchObject({ code: "invalid_input" });
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${context.sessionId}`));
      await expect(database.withContext(fixture.fixture.own, (transaction) => authorizeMessagingTribeManagement(transaction, context))).rejects.toMatchObject({ code: "authentication_required" });
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '1 hour' where id=${context.sessionId}`));
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${context.tribeId} and user_id=${context.actorUserId}`));
      await expect(resolve()).rejects.toMatchObject({ code: "permission_denied" });
      await expect(database.withContext(fixture.fixture.own, (transaction) => authorizeMessagingTribeManagement(transaction, context))).rejects.toMatchObject({ code: "permission_denied" });
    });
  }, 300_000);
});
