/** @vitest-environment node */
/** Exercises immutable candidate versions, exact AAD, no-op and original replay against real protected PostgreSQL. @module messaging-connection-configuration-tests */
import {randomBytes,randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {PostgresMessagingConnectionConfiguration} from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-configuration";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import {createMessagingSecretCipher,type MessagingSecretEnvelope} from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("immutable SQL configuration",()=>{
  it("should preserve historical configuration, create a new AAD-bound untested candidate and keep no-op/replay without policy or delivery effects",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),credential=randomUUID(),senderId=randomUUID();
      await database.applyMigration("20261005100000_guard_messaging_secret_retirement.sql");
      const created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Configuración inmutable",apiKey:credential});if(created.state!=="completed")throw new Error("Expected candidate creation");
      const context=await database.withContext(fixture.fixture.own,async(transaction):Promise<AuthorizedMessagingContext>=>{
        const now=new Date((await transaction.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now),validUntil=new Date(now.getTime()+540_000),intentId=randomUUID();
        await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.context.actorUserId},${fixture.context.sessionId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.tribeId},'configure_messaging_connection',${created.result.id},'/synthetic-configure',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
        await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.context.actorUserId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.sessionId},${fixture.context.tribeId},'configure_messaging_connection',${created.result.id},${now},${now},${validUntil})`);
        const secretRef=(await transaction.execute<{secret_ref:string}>(sql`select secret_ref from public.messaging_connection_versions where connection_id=${created.result.id} and version=1`)).rows[0].secret_ref;
        return{...fixture.context,authorizationPurpose:"sensitive_leader",resourceId:created.result.id,connectionId:created.result.id,connectionVersion:1,secretRef,operation:"configure_messaging_connection",authenticatedAt:now,validUntil,environment:fixture.fixture.config.environment,securityEpoch:fixture.fixture.config.securityEpoch};
      });
      const execute=<Result>(_context:AuthorizedMessagingContext,run:(transaction:RequestDatabase)=>Promise<Result>)=>database.withContext(fixture.fixture.own,run);
      const owner=new PostgresMessagingConnectionConfiguration(execute,async()=>fixture.fixture.config),input={operationId:randomUUID(),expectedVersion:1,confirmed:true as const,channel:"email"as const,senderId};
      const inspection={credential,sender:{resourceId:senderId,name:"Remitente confirmado",channels:["email"as const],canSendWhatsappTemplates:false}};
      expect(await owner.prepare(context,input)).toEqual({state:"prepared",configurationVersion:1,changed:true});
      const first=await owner.commit(context,input,inspection);expect(first).toMatchObject({state:"completed",result:{version:2,configurationVersion:2,changed:true,state:"draft"}});
      const rows=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute<{version:number;secret_ref:string;email_sender_id:string|null;credential_validation_status:string;retired_at:string|null}>(sql`select version,secret_ref,email_sender_id,credential_validation_status,retired_at from public.messaging_connection_versions where connection_id=${context.connectionId} order by version`)).rows);
      expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({version:1,email_sender_id:null});expect(rows[1]).toMatchObject({version:2,email_sender_id:senderId,credential_validation_status:"not_validated",retired_at:null});expect(rows[1].secret_ref).not.toBe(rows[0].secret_ref);
      const current={...context,connectionVersion:2,secretRef:rows[1].secret_ref};
      expect(await owner.prepare(current,input)).toMatchObject({state:"completed",replayed:true,result:first.state==="completed"?first.result:undefined});
      const noOp={...input,operationId:randomUUID(),expectedVersion:2};expect(await owner.prepare(current,noOp)).toEqual({state:"prepared",configurationVersion:2,changed:false});
      expect(await owner.commit(current,noOp,null)).toMatchObject({state:"completed",result:{version:2,configurationVersion:2,changed:false}});
      await expect(owner.prepare(current,{...input,operationId:randomUUID()})).rejects.toMatchObject({code:"connection_conflict"});
      const stored=await database.withContext(fixture.fixture.own,async(transaction)=>({
        envelope:(await transaction.execute<{format:number;purpose:"credential";environment:string;security_epoch:string;key_id:string;iv:Uint8Array;ciphertext:Uint8Array}>(sql`select format,purpose,environment,security_epoch,key_id,iv,ciphertext from public.messaging_secret_envelopes where secret_ref=${current.secretRef}`)).rows[0],
        capability:(await transaction.execute(sql`select channel,sender_id,state,tested_at from public.messaging_connection_capabilities where connection_id=${context.connectionId} and connection_version=2`)).rows,
        connection:(await transaction.execute(sql`select version,is_selected,is_candidate,selected_version,candidate_version from public.tenant_messaging_connections where id=${context.connectionId}`)).rows[0],
        counts:(await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where tribe_id=${context.tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_events where tribe_id=${context.tribeId}) as usage,(select count(*)::int from public.messaging_usage_policies where tribe_id=${context.tribeId}) as policies`)).rows[0],
        results:(await transaction.execute(sql`select public_result from public.academy_admission_operations where tribe_id=${context.tribeId}`)).rows,
      }));
      const envelope:MessagingSecretEnvelope={format:stored.envelope.format,purpose:stored.envelope.purpose,environment:stored.envelope.environment,securityEpoch:stored.envelope.security_epoch,keyId:stored.envelope.key_id,iv:stored.envelope.iv,ciphertext:stored.envelope.ciphertext};
      const cipher=createMessagingSecretCipher(fixture.fixture.config),scope={tribeId:context.tribeId,connectionId:context.connectionId,connectionVersion:2,resourceId:current.secretRef};
      expect(await cipher.open(envelope,scope)).toBe(credential);await expect(cipher.open(envelope,{...scope,connectionVersion:1})).rejects.toMatchObject({code:"messaging_crypto_authentication_failed"});
      expect(stored.capability).toEqual([{channel:"email",sender_id:senderId,state:"unprepared",tested_at:null}]);expect(stored.connection).toEqual({version:2,is_selected:false,is_candidate:true,selected_version:null,candidate_version:2});expect(stored.counts).toEqual({deliveries:0,usage:0,policies:0});expect(JSON.stringify(stored.results)).not.toContain(credential);
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        await transaction.execute(sql`update public.tenant_messaging_connections set is_selected=true,selected_version=2,is_candidate=false,candidate_version=null,state='active' where id=${context.connectionId}`);
        await transaction.execute(sql`update public.messaging_connection_versions set credential_validation_status='valid',is_test_mode=false,credential_validated_at=clock_timestamp() where connection_id=${context.connectionId} and version=2`);
        await transaction.execute(sql`update public.messaging_connection_capabilities set state='prepared',tested_at=clock_timestamp(),platform_restrictions='[{"country":"AR","channel":"email","allowed":false}]'::jsonb where connection_id=${context.connectionId} and connection_version=2`);
      });
      const replacementSender=randomUUID(),replacement={...input,operationId:randomUUID(),expectedVersion:2,senderId:replacementSender};
      expect(await owner.commit(current,replacement,{credential,sender:{...inspection.sender,resourceId:replacementSender}})).toMatchObject({state:"completed",result:{version:3,configurationVersion:3,changed:true,state:"active"}});
      const preserved=await database.withContext(fixture.fixture.own,async(transaction)=>({
        versions:(await transaction.execute(sql`select version,email_sender_id,credential_validation_status,retired_at from public.messaging_connection_versions where connection_id=${context.connectionId} and version>=2 order by version`)).rows,
        slots:(await transaction.execute(sql`select selected_version,candidate_version,state from public.tenant_messaging_connections where id=${context.connectionId}`)).rows[0],
        capabilities:(await transaction.execute(sql`select connection_version,state,tested_at,platform_restrictions from public.messaging_connection_capabilities where connection_id=${context.connectionId} and connection_version>=2 order by connection_version`)).rows,
      }));
      expect(preserved.slots).toEqual({selected_version:2,candidate_version:3,state:"active"});expect(preserved.versions).toEqual([{version:2,email_sender_id:senderId,credential_validation_status:"valid",retired_at:null},{version:3,email_sender_id:replacementSender,credential_validation_status:"not_validated",retired_at:null}]);
      expect(preserved.capabilities).toEqual([{connection_version:2,state:"prepared",tested_at:expect.anything(),platform_restrictions:[{country:"AR",channel:"email",allowed:false}]},{connection_version:3,state:"unprepared",tested_at:null,platform_restrictions:[{country:"AR",channel:"email",allowed:false}]}]);
      const thirdSecretRef=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute<{secret_ref:string}>(sql`select secret_ref from public.messaging_connection_versions where connection_id=${context.connectionId} and version=3`)).rows[0].secret_ref),thirdContext={...context,connectionVersion:3,secretRef:thirdSecretRef},interrupted={...replacement,operationId:randomUUID(),expectedVersion:3,senderId:randomUUID()};
      await expect(owner.commit(thirdContext,interrupted,null)).rejects.toMatchObject({code:"missing_capability"});
      expect(await owner.prepare(thirdContext,interrupted)).toMatchObject({state:"started",operationId:interrupted.operationId});
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.academy_admission_operations set lease_until=clock_timestamp()-interval '1 second',version=version+1 where actor_user_id=${context.actorUserId} and tribe_id=${context.tribeId} and operation_type='configure_messaging_connection' and idempotency_key=${interrupted.operationId}`));
      expect(await owner.prepare(thirdContext,interrupted)).toEqual({state:"prepared",configurationVersion:3,changed:true});
      expect(await owner.commit(thirdContext,interrupted,{credential,sender:{...inspection.sender,resourceId:interrupted.senderId}})).toMatchObject({state:"completed",result:{version:4,configurationVersion:4,changed:true}});
    });
  },360_000);
});
