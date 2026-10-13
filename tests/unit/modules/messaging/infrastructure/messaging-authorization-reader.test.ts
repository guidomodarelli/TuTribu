/** @vitest-environment node */
/** Exercises current SQL sessions, canonical leadership and resource-version scope without credential disclosure. @module messaging-authorization-reader-tests */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareContactVerificationIssuer} from "@/tests/support/contact-verification-issuance-fixture";
import {PostgresMessagingAuthorizationReader} from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-authorization-reader";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("current messaging SQL authority",()=>{
  it("should use the current leader rather than the tribe creator and read only its selected or candidate version",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareContactVerificationIssuer(database);
      const creatorId=randomUUID(),sessionId=randomUUID();
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${creatorId},'Synthetic former creator',${`${creatorId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`update public.tribes set created_by=${creatorId} where id=${fixture.scope.tribeId}`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch) values (${fixture.scope.connectionId},${fixture.scope.tribeId},2,${fixture.config.environment},${fixture.config.securityEpoch})`);
        await transaction.execute(sql`update public.tenant_messaging_connections set candidate_version=2,is_candidate=true where id=${fixture.scope.connectionId}`);
      });
      await database.withContext(fixture.own,async(transaction)=>{
        const reader=new PostgresMessagingAuthorizationReader(transaction,sessionId);
        expect(await reader.getCurrentLeadership(fixture.scope.tribeId,fixture.userId)).toMatchObject({leaderUserId:fixture.userId,membership:{userId:fixture.userId,role:"leader",status:"active"}});
        const selected=await reader.getConnection(fixture.scope.tribeId,fixture.scope.connectionId);
        expect(selected).toMatchObject({id:fixture.scope.connectionId,tribeId:fixture.scope.tribeId,version:1,environment:fixture.config.environment,secretRef:expect.any(String)});
        expect(selected).not.toHaveProperty("ciphertext");expect(selected).not.toHaveProperty("apiKey");
        expect(await new PostgresMessagingAuthorizationReader(transaction,sessionId,"candidate").getConnection(fixture.scope.tribeId,fixture.scope.connectionId)).toMatchObject({version:2,secretRef:null});
        expect(await reader.getConnection(randomUUID(),fixture.scope.connectionId)).toBeNull();
        expect(await reader.getCurrentLeadership(fixture.scope.tribeId,creatorId)).toBeNull();
      });
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`update public.messaging_connection_versions set retired_at=clock_timestamp() where connection_id=${fixture.scope.connectionId} and version=2`);
        expect(await new PostgresMessagingAuthorizationReader(transaction,sessionId,"candidate").getConnection(fixture.scope.tribeId,fixture.scope.connectionId)).toMatchObject({version:2,retiredAt:expect.any(Date)});
        await transaction.execute(sql`update public.tenant_messaging_connections set is_candidate=false where id=${fixture.scope.connectionId}`);
        expect(await new PostgresMessagingAuthorizationReader(transaction,sessionId,"candidate").getConnection(fixture.scope.tribeId,fixture.scope.connectionId)).toBeNull();
      });
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`delete from public.session where id=${sessionId}`));
      expect(await database.withContext(fixture.own,(transaction)=>new PostgresMessagingAuthorizationReader(transaction,sessionId).getConnection(fixture.scope.tribeId,fixture.scope.connectionId))).toBeNull();
    });
  },180_000);

  it.each(["expired_session","lost_leadership"] as const)("should close metadata access after %s without trusting stale facts",async(changed)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareContactVerificationIssuer(database),sessionId=randomUUID();
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        if(changed==="expired_session")await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${sessionId}`);
        else await transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.scope.tribeId} and user_id=${fixture.userId}`);
      });
      expect(await database.withContext(fixture.own,(transaction)=>new PostgresMessagingAuthorizationReader(transaction,sessionId).getConnection(fixture.scope.tribeId,fixture.scope.connectionId))).toBeNull();
    });
  },180_000);
});
