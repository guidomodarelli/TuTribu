/** @vitest-environment node */
/** Exercises actual local compromise effects and original replay against protected SQL evidence/accounting. @module messaging-connection-compromise-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingConnectionCreation } from "@/tests/support/messaging-connection-fixture";
import { seedPreviousMessagingSelection } from "@/tests/support/messaging-selection-fixture";
import { PostgresMessagingConnectionSuspension } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-suspension";
import { PostgresMessagingLifecycleDependencies } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-messaging-lifecycle-dependencies";
import type { MessagingConnectionLifecycleContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("compromised connection evidence",()=>{
  it("should revoke unused and pending-applied evidence while preserving policy, request provenance, accepted/unknown deliveries and charged reservations",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database);await database.applyMigration("20261005092500_guard_messaging_attempts.sql");await database.applyMigration("20261005100000_guard_messaging_secret_retirement.sql");
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id) values (${fixture.context.tribeId})`));
      const created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Candidata conservada",apiKey:randomUUID()});if(created.state!=="completed")throw new Error("Expected candidate fixture");
      const previous=await seedPreviousMessagingSelection(database,fixture,created.result.id),before=await previous.snapshot();
      const context=await database.withContext(fixture.fixture.own,async(transaction):Promise<MessagingConnectionLifecycleContext>=>{
        const now=new Date((await transaction.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now),validUntil=new Date(now.getTime()+540_000),intentId=randomUUID();
        await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.context.actorUserId},${fixture.context.sessionId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.tribeId},'suspend_messaging_connection',${previous.connectionId},'/synthetic-compromise',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
        await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.context.actorUserId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.sessionId},${fixture.context.tribeId},'suspend_messaging_connection',${previous.connectionId},${now},${now},${validUntil})`);
        return{...fixture.context,connectionId:previous.connectionId,resourceId:previous.connectionId,operation:"suspend_messaging_connection",authenticatedAt:now,validUntil};
      });
      const owner=new PostgresMessagingConnectionSuspension((_context,run)=>database.withContext(fixture.fixture.own,run),async()=>fixture.fixture.config,(transaction)=>new PostgresMessagingLifecycleDependencies(transaction,async()=>true)),input={operationId:randomUUID(),confirmed:true as const,expectedVersion:1,reason:"suspected_compromise" as const};
      expect(await owner.suspend(context,input)).toMatchObject({state:"completed",result:{id:previous.connectionId,version:2,state:"suspended",reason:"suspected_compromise",changed:true}});
      const after=await previous.snapshot();expect(after.policy).toEqual(before.policy);expect(after.request).toEqual(before.request);expect(after.usage).toEqual(before.usage);expect(after.reservations).toEqual(before.reservations);expect(after.secrets).toEqual(before.secrets);
      expect(after.connections.find((connection)=>connection.id===created.result.id)).toEqual(before.connections.find((connection)=>connection.id===created.result.id));expect(after.connections.find((connection)=>connection.id===previous.connectionId)).toMatchObject({state:"suspended",is_selected:true,selected_version:1});
      for(const evidence of[previous.used,previous.unused])expect(after.proofs.find((proof)=>proof.id===evidence.proofId)).toMatchObject({status:"invalid",invalidation_reason:"suspected_compromise"});
      expect(after.proofs.find((proof)=>proof.id===previous.used.proofId)).toMatchObject({applied_request_id:previous.requestId,applied_at:before.proofs.find((proof)=>proof.id===previous.used.proofId)!.applied_at});
      for(const deliveryId of[previous.acceptedDeliveryId,previous.unknownDeliveryId])expect(after.deliveries.find((delivery)=>delivery.id===deliveryId)).toEqual(before.deliveries.find((delivery)=>delivery.id===deliveryId));
      for(const evidence of[previous.used,previous.unused])expect(after.deliveries.find((delivery)=>delivery.id===evidence.deliveryId)).toMatchObject({state:"cancelled",last_outcome:"suspected_compromise"});
      expect(await owner.suspend(context,input)).toMatchObject({state:"completed",replayed:true,result:{version:2,changed:true}});expect(await previous.snapshot()).toEqual(after);
    });
  },600_000);
});
