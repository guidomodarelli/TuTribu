/** @vitest-environment node */
/** Exercises actual ordinary retirement effects and original replay against protected SQL evidence/accounting. @module messaging-connection-disconnection-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingConnectionCreation } from "@/tests/support/messaging-connection-fixture";
import { seedPreviousMessagingSelection } from "@/tests/support/messaging-selection-fixture";
import { PostgresMessagingConnectionDisconnection } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-disconnection";
import { PostgresMessagingLifecycleDependencies } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-messaging-lifecycle-dependencies";
import { readAdmissionEmailLifecycleDependency } from "@/src/modules/notifications/infrastructure/repositories/admission-email-lifecycle-reader";
import type { MessagingConnectionLifecycleContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";
import { expectAdmissionProofInvalidationAudits } from "@/tests/support/admission-proof-invalidation-audit-assertions";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("ordinary connection retirement",()=>{
  it("should block enabled external dependencies and retire only after resolution, preserving applied proof and charged delivery history",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database);await database.applyMigration("20261005092500_guard_messaging_attempts.sql");await database.applyMigration("20261005100000_guard_messaging_secret_retirement.sql");await database.applyMigration("20261006160000_purge_verification_delivery_material.sql");
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id) values (${fixture.context.tribeId})`));
      const created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Candidata conservada",apiKey:randomUUID()});if(created.state!=="completed")throw new Error("Expected candidate fixture");
      const previous=await seedPreviousMessagingSelection(database,fixture,created.result.id),before=await previous.snapshot();
      const context: MessagingConnectionLifecycleContext = {...fixture.context,connectionId:previous.connectionId,resourceId:previous.connectionId,operation:"disconnect_messaging_connection"};
      await database.applyMigration("20261008161500_create_admission_email_settings.sql");
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        expect(await readAdmissionEmailLifecycleDependency(context,transaction)).toBe(false);expect((await transaction.execute(sql`select tribe_id from public.admission_email_settings where tribe_id=${context.tribeId}`)).rows).toEqual([]);
        await transaction.execute(sql`insert into public.admission_email_settings(tribe_id,enabled,enabled_at) values (${context.tribeId},true,clock_timestamp())`);expect(await readAdmissionEmailLifecycleDependency(context,transaction)).toBe(true);
      });
      await expect(database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.admission_email_settings set enabled=false where tribe_id=${context.tribeId}`))).rejects.toMatchObject({cause:{code:"23514"}});
      await database.grantTablesToNonBypass(["admission_email_settings"]);
      expect(await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select tribe_id from public.admission_email_settings where tribe_id=${context.tribeId}`)).rows,"non_bypass")).toEqual([]);
      const owner=new PostgresMessagingConnectionDisconnection((_context,run)=>database.withContext(fixture.fixture.own,run),async()=>fixture.fixture.config,(transaction)=>new PostgresMessagingLifecycleDependencies(transaction,readAdmissionEmailLifecycleDependency)),input={operationId:randomUUID(),confirmed:true as const,expectedVersion:1};
      await expect(owner.disconnect(context,input)).rejects.toMatchObject({code:"connection_incomplete"});expect(await previous.snapshot()).toEqual(before);
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        await transaction.execute(sql`update public.admission_email_settings set enabled=false,version=version+1,updated_at=clock_timestamp() where tribe_id=${context.tribeId}`);
        expect(await readAdmissionEmailLifecycleDependency(context,transaction)).toBe(false);
      });
      const original={...input,operationId:randomUUID()};expect(await owner.disconnect(context,original)).toMatchObject({state:"completed",result:{id:previous.connectionId,version:2,state:"disconnected",reason:null,changed:true}});
      const expectedProofAudits={tribeId:context.tribeId,actorUserId:context.actorUserId,operationId:original.operationId,cause:"connection_disconnected",proofs:[{proofId:previous.unused.proofId,challengeId:previous.unused.challengeId,fromState:"available" as const,requestId:null,verificationEpoch:Number(before.policy.verification_epoch),channel:"email" as const}]};
      await database.withContext(fixture.fixture.own,(transaction)=>expectAdmissionProofInvalidationAudits(transaction,expectedProofAudits));
      const audit=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select event.metadata,event.cause,event.created_at=connection.retired_at as owner_clock,operation.idempotency_key from public.academy_admission_audit_events event join public.tenant_messaging_connections connection on connection.id=event.resource_id and connection.tribe_id=event.tribe_id join public.academy_admission_operations operation on operation.id=event.operation_id and operation.tribe_id=event.tribe_id where event.resource_id=${previous.connectionId} and event.event_type='disconnect_messaging_connection'`)).rows);
      expect(audit).toEqual([{metadata:{fromState:"active",toState:"disconnected",previousVersion:1,configurationVersion:1,previousConfigurationVersion:1,channel:null},cause:"connection_disconnected",owner_clock:true,idempotency_key:original.operationId}]);
      const after=await previous.snapshot();expect(after.request).toEqual(before.request);expect(after.usage).toEqual(before.usage);expect(after.reservations).toEqual(before.reservations);
      expect(after.policy).toEqual({...before.policy,version:Number(before.policy.version)+1,messaging_connection_id:null,messaging_connection_version:null});
      expect(after.connections.find((connection)=>connection.id===created.result.id)).toEqual(before.connections.find((connection)=>connection.id===created.result.id));expect(after.connections.find((connection)=>connection.id===previous.connectionId)).toMatchObject({state:"disconnected",is_selected:false,selected_version:null,is_candidate:false,candidate_version:null,retired_at:expect.anything()});
      expect(after.proofs.find((proof)=>proof.id===previous.used.proofId)).toEqual(before.proofs.find((proof)=>proof.id===previous.used.proofId));expect(after.proofs.find((proof)=>proof.id===previous.unused.proofId)).toMatchObject({status:"invalid",invalidation_reason:"connection_disconnected"});
      for(const deliveryId of[previous.acceptedDeliveryId,previous.unknownDeliveryId])expect(after.deliveries.find((delivery)=>delivery.id===deliveryId)).toEqual(before.deliveries.find((delivery)=>delivery.id===deliveryId));
      for(const evidence of[previous.used,previous.unused])expect(after.deliveries.find((delivery)=>delivery.id===evidence.deliveryId)).toMatchObject({state:"cancelled",last_outcome:"connection_disconnected"});
      expect(after.versions.find((version)=>version.connection_id===previous.connectionId)).toMatchObject({retired_at:expect.anything(),purge_after:expect.anything()});expect(after.secrets.find((secret)=>secret.connection_id===previous.connectionId)).toMatchObject({retired_at:expect.anything(),purge_after:expect.anything()});
      expect(await owner.disconnect(context,original)).toMatchObject({state:"completed",replayed:true,result:{version:2,changed:true}});expect(await previous.snapshot()).toEqual(after);
      await database.withContext(fixture.fixture.own,(transaction)=>expectAdmissionProofInvalidationAudits(transaction,expectedProofAudits));
    });
  },600_000);
});
