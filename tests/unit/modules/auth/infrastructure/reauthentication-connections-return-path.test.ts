/** @vitest-environment node */
/** Exercises exact wizard return destinations on owned real PostgreSQL resources without OAuth or secret lookup. @module reauthentication-connections-return-path-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {PostgresReauthenticationResourceAuthorizer} from "@/src/modules/auth/infrastructure/repositories/postgres-reauthentication-resource-authorizer";
import type {RecentAuthenticationScope} from "@/src/modules/auth/domain/entities/recent-authentication-evidence";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("wizard reauthentication return scope",()=>{
  it("should permit only the same tribe wizard for implemented connection actions while preserving unrelated policy destinations",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Conexión para confirmar",apiKey:randomUUID()});if(created.state!=="completed")throw new Error("Expected protected connection");
      const scope:RecentAuthenticationScope={userId:fixture.context.actorUserId,sessionId:fixture.context.sessionId,accountId:fixture.context.accountId,subject:fixture.context.subject,tribeId:fixture.context.tribeId,operation:"save_messaging_credentials",resourceId:fixture.context.tribeId},landing=`/connection-${scope.tribeId}`,wizard=`${landing}/academia/admissions/messaging/connections`;
      const resolve=(current:RecentAuthenticationScope)=>database.withContext(fixture.fixture.own,(transaction)=>new PostgresReauthenticationResourceAuthorizer(transaction).resolve(current));
      expect(await resolve(scope)).toEqual({allowedReturnPaths:[landing,wizard]});expect(await resolve({...scope,operation:"configure_messaging_connection",resourceId:created.result.id})).toEqual({allowedReturnPaths:[landing,wizard]});
      expect(await resolve({...scope,tribeId:randomUUID(),operation:"configure_messaging_connection",resourceId:created.result.id})).toBeNull();
      expect(await resolve({...scope,operation:"update_admission_policy"})).toEqual({allowedReturnPaths:[landing,`${landing}/academia/admissions/settings`]});
    });
  },300_000);
});
