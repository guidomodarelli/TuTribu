/** @vitest-environment node */
/** Exercises focal diagnostic claims against real PostgreSQL without claiming unrelated queue work. @module scoped-diagnostic-delivery-tests */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareContactVerificationIssuer} from "@/tests/support/contact-verification-issuance-fixture";
import {seedContactVerificationChallenge} from "@/tests/support/contact-verification-database-fixture";
import {PostgresMessageDeliveryRepository} from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("focal diagnostic dispatch",()=>{
  it("should claim only the committed diagnostic delivery, reject crossed scopes and keep unrelated work unleased",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareContactVerificationIssuer(database,"connection_diagnostic");
      await database.applyMigration("20261006140000_claim_messaging_deliveries_fairly.sql");
      await database.applyMigration("20261007050000_claim_scoped_diagnostic_delivery.sql");
      const issued=await fixture.issue();if(issued.state!=="completed"||issued.result.outcome!=="issued")throw new Error("Expected issued diagnostic");
      const unrelated=await seedContactVerificationChallenge(database,{userId:fixture.userId,own:fixture.own,config:fixture.config},"connection_diagnostic");
      const scope={deliveryId:issued.result.deliveryId,tribeId:fixture.scope.tribeId,contributingLeaderUserId:fixture.userId,connectionId:fixture.scope.connectionId,connectionVersion:fixture.scope.connectionVersion};
      const execute=<Result>(_actor:string|null,run:(transaction:RequestDatabase)=>Promise<Result>)=>database.withContext(fixture.own,run),repository=new PostgresMessageDeliveryRepository(execute,async()=>true,async()=>fixture.config,scope);
      const command={leaseToken:randomUUID(),limit:2,leaseSeconds:90};
      expect(await new PostgresMessageDeliveryRepository(execute,async()=>true,async()=>fixture.config,{...scope,connectionVersion:2}).claim({...command,leaseToken:randomUUID()})).toEqual([]);
      const claims=await repository.claim(command);expect(claims).toEqual([{deliveryId:scope.deliveryId,tribeId:scope.tribeId,contributingLeaderUserId:scope.contributingLeaderUserId,leaseToken:command.leaseToken,version:2}]);
      const other=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select lease_token,version,state from public.message_deliveries where id=${unrelated.deliveryId}`)).rows[0]);expect(other).toEqual({lease_token:null,version:1,state:"queued"});
      expect(await new PostgresMessageDeliveryRepository(execute,async()=>true,async()=>fixture.config,{...scope,tribeId:unrelated.scope.tribeId}).claim({...command,leaseToken:randomUUID()})).toEqual([]);
      await expect(repository.authorize({...claims[0],deliveryId:unrelated.deliveryId},randomUUID())).rejects.toMatchObject({code:"permission_denied"});
      await expect(repository.reconcileExpiredLeases(1)).rejects.toMatchObject({code:"permission_denied"});
      const counts=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.message_delivery_attempts) as attempts,(select count(*)::int from public.messaging_usage_reservations) as reservations`)).rows[0]);expect(counts).toEqual({attempts:0,reservations:0});
    });
  },240_000);
});
