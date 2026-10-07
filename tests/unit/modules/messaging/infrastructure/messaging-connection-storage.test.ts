/** @vitest-environment node */
/** Exercises private connection slots and tenant references through real SQL and Drizzle. @module messaging-connection-storage-tests */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer } from "@/tests/support/contact-verification-issuance-fixture";
import { tenantMessagingConnections, messagingConnectionVersions, messagingSecretEnvelopes } from "@/src/modules/shared/infrastructure/database/schema";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("private messaging connection storage",()=>{
  it.each(["suspended","degraded"] as const)("should keep both selected and candidate slots occupied in %s and hide stored credentials from ordinary reads",async(state)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareContactVerificationIssuer(database);
      const candidateId=randomUUID();
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.insert(tenantMessagingConnections).values({id:candidateId,tribeId:fixture.scope.tribeId,contributedByUserId:fixture.userId,state:"draft",environment:fixture.config.environment,securityEpoch:fixture.config.securityEpoch,isSelected:false,isCandidate:true,candidateVersion:1});
        await transaction.insert(messagingConnectionVersions).values({connectionId:candidateId,tribeId:fixture.scope.tribeId,version:1,environment:fixture.config.environment,securityEpoch:fixture.config.securityEpoch});
        await transaction.execute(sql`update public.tenant_messaging_connections set state=${state},version=version+1 where tribe_id=${fixture.scope.tribeId}`);
      });
      for(const selected of [true,false]){
        await expect(database.withContext(fixture.own,(transaction)=>transaction.insert(tenantMessagingConnections).values({tribeId:fixture.scope.tribeId,contributedByUserId:fixture.userId,state:"draft",environment:fixture.config.environment,securityEpoch:fixture.config.securityEpoch,isSelected:selected,isCandidate:!selected}))).rejects.toMatchObject({cause:{code:"23505"}});
      }
      const retained=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select is_selected,is_candidate,state,version from public.tenant_messaging_connections where tribe_id=${fixture.scope.tribeId} order by is_selected desc`)).rows);
      expect(retained).toEqual([{is_selected:true,is_candidate:false,state,version:2},{is_selected:false,is_candidate:true,state,version:2}]);
      const otherTribeId=randomUUID();
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${otherTribeId},'Synthetic private scope',${`private-${otherTribeId}`},${fixture.userId})`));
      await expect(database.withContext(fixture.own,(transaction)=>transaction.insert(messagingConnectionVersions).values({connectionId:fixture.scope.connectionId,tribeId:otherTribeId,version:2,environment:fixture.config.environment,securityEpoch:fixture.config.securityEpoch}))).rejects.toMatchObject({cause:{code:"23503"}});
      await database.grantTablesToNonBypass(["tenant_messaging_connections","messaging_connection_versions","messaging_secret_envelopes"]);
      const ordinary=await database.withContext(fixture.own,async(transaction)=>({
        connections:await transaction.select({id:tenantMessagingConnections.id}).from(tenantMessagingConnections).where(eq(tenantMessagingConnections.tribeId,fixture.scope.tribeId)),
        versions:await transaction.select({secretRef:messagingConnectionVersions.secretRef}).from(messagingConnectionVersions).where(eq(messagingConnectionVersions.tribeId,fixture.scope.tribeId)),
        credentials:await transaction.select({ciphertext:messagingSecretEnvelopes.ciphertext}).from(messagingSecretEnvelopes).where(eq(messagingSecretEnvelopes.tribeId,fixture.scope.tribeId)),
      }),"non_bypass");
      expect(ordinary).toEqual({connections:[],versions:[],credentials:[]});
    });
  },180_000);
});
