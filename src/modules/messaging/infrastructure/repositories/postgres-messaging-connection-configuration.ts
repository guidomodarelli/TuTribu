/** Commits immutable effective versions and exact envelopes after read-only resource inspection. @module postgres-messaging-connection-configuration */
import "server-only";
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConnectionConfigurationInput,MessagingConnectionConfigurationOperations,MessagingConfigurationInspection} from "@/src/modules/messaging/domain/repositories/messaging-connection-configuration";
import type {MessagingSecurityConfig} from "../config/messaging-security-config";
import type {AdmissionOperationCommand} from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import {PostgresAdmissionOperationRepository} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import {AdmissionOperationError} from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import {ADMISSION_ERROR_CODE} from "@/src/modules/academy-admissions/constants/admission-errors";
import {MessagingConnectionOperationError} from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_CONNECTION_STATE} from "@/src/modules/messaging/constants/messaging-connection";
import {MESSAGING_PUBLIC_CHANNEL,MESSAGING_GENERIC_CREDENTIAL_MASK,MESSAGING_CAPABILITY_PUBLIC_STATE} from "@/src/modules/messaging/constants/messaging-public-contract";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {messagingConnectionConfigurationSchema} from "@/src/modules/messaging/application/results/messaging-connection-configuration-result";
import {createMessagingSecretCipher} from "../encryption/messaging-secret-cipher";
import {MessagingCryptographyError} from "../encryption/messaging-cryptography-error";
import {authorizeMessagingSecret,messagingSecretLifetimeIsCurrent} from "./postgres-messaging-secret-authorizer";
import {PostgresMessagingAuthorizationReader} from "./postgres-messaging-authorization-reader";
import {executeMessagingLedger} from "./execute-messaging-ledger";

/** Uses only protected current native transactions; no callback can access the provider. */
export type MessagingConfigurationDatabaseExecutor=<Result>(context:AuthorizedMessagingContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;
/** Consumed immutable fields remain database-owned facts, not schema-validated upstream payloads. */
type CurrentConfiguration={name:string;version:number;state:"draft"|"ready"|"active"|"degraded"|"suspended"|"disconnected";selected_version:number|null;candidate_version:number|null;is_selected:boolean;email_sender_id:string|null;sms_sender_id:string|null;whatsapp_sender_id:string|null;whatsapp_template_id:string|null;whatsapp_template_language:string|null};

/** Replays before CAS and keeps selected versions untouched while replacing only the candidate configuration. */
export class PostgresMessagingConnectionConfiguration implements MessagingConnectionConfigurationOperations{
  /** @param execute - Current native principal's guarded database executor. @param readSecurityConfig - Current external epoch/recovery and purpose-separated keyrings. */
  constructor(private readonly execute:MessagingConfigurationDatabaseExecutor,private readonly readSecurityConfig:()=>Promise<MessagingSecurityConfig>){}
  /** @param context - Current private principal/resource. @param input - Stable boundary-normalized action. @returns Exact own MAC intent, with no transient key or provider payload. */
  private command(context:AuthorizedMessagingContext,input:MessagingConnectionConfigurationInput):AdmissionOperationCommand{return{actorUserId:context.actorUserId,tribeId:context.tribeId,operationType:REAUTHENTICATION_OPERATION.configureMessagingConnection,idempotencyKey:input.operationId,intent:{connectionId:context.connectionId,expectedVersion:input.expectedVersion,channel:input.channel,senderId:input.senderId,templateId:input.templateId??null,templateLanguage:input.templateLanguage??null,confirmed:input.confirmed}};}
  /** @param database - Protected current transaction. @param context - Exact current human recency/resource. @param mutate - Locks the tribe exclusively before resource reads to avoid candidate-slot lock upgrades. @returns Current authorized selected/candidate scope and SQL time, also after this owner's effective version change. */
  private async authorize(database:RequestDatabase,context:AuthorizedMessagingContext,mutate=false){
    if(context.operation!==REAUTHENTICATION_OPERATION.configureMessagingConnection||context.resourceId!==context.connectionId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    if(mutate)await database.execute(sql`select id from public.tribes where id=${context.tribeId} for update`);
    const session=(await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} and "expiresAt">clock_timestamp()`)).rows[0];if(!session)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    try{
      const resource=await new PostgresMessagingAuthorizationReader(database,context.sessionId,"management").getConnection(context.tribeId,context.connectionId);
      if(!resource?.secretRef||resource.retiredAt!==null)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const current={...context,connectionVersion:resource.version,secretRef:resource.secretRef};
      const authority=await authorizeMessagingSecret(database,current,mutate),config=await this.readSecurityConfig();
      if(config.recoveryLocked||config.environment!==context.environment||config.securityEpoch!==context.securityEpoch||!config.keyrings.credential.keys.has(authority.keyId))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
      const now=new Date((await database.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now);
      if(!messagingSecretLifetimeIsCurrent(authority,now))throw new AdmissionOperationError((await database.execute(sql`select id from public.session where id=${context.sessionId} and "expiresAt">clock_timestamp()`)).rows[0]?ADMISSION_ERROR_CODE.reauthenticationRequired:ADMISSION_ERROR_CODE.authenticationRequired);
      return{context:current,now};
    }catch(error){if(error instanceof MessagingSecretAccessError)throw new AdmissionOperationError(error.code,{cause:error});throw error;}
  }
  /** @param context - Exact current principal. @param mutate - Exclusive candidate-slot management for commits. @returns Real DB-only ledger with current authority before replay and after writes. */
  private ledger(context:AuthorizedMessagingContext,mutate=false){return new PostgresAdmissionOperationRepository((run)=>executeMessagingLedger(()=>this.execute(context,run)),async(database)=>{await this.authorize(database,context,mutate);return true;},this.readSecurityConfig);}
  /** @param error - Original private failure. @returns Safe typed metadata with genuinely registered progress only. */
  private failure(error:unknown){
    if(error instanceof MessagingConnectionOperationError)return error;
    const code=error instanceof AdmissionOperationError?Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===error.code)??MESSAGING_ERROR_CODE.unexpectedFailure:error instanceof MessagingCryptographyError?MESSAGING_ERROR_CODE.connectionIncomplete:MESSAGING_ERROR_CODE.unexpectedFailure;
    return new MessagingConnectionOperationError(code,{cause:error,...(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved&&error.operationId?{operationId:error.operationId}:{})});
  }
  /** @param database - Authorized protected transaction. @param context - Exact originally resolved configuration. @param input - Current CAS intent. @returns Current immutable fields and semantic change, never an invented replacement of another candidate. */
  private async current(database:RequestDatabase,context:AuthorizedMessagingContext,input:MessagingConnectionConfigurationInput){
    const authority=await this.authorize(database,context);
    if(authority.context.connectionVersion!==context.connectionVersion||authority.context.secretRef!==context.secretRef)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
    const row=(await database.execute<CurrentConfiguration>(sql`select connection.name,connection.version,connection.state,connection.is_selected,connection.selected_version,connection.candidate_version,resource.email_sender_id,resource.sms_sender_id,resource.whatsapp_sender_id,resource.whatsapp_template_id,resource.whatsapp_template_language from public.tenant_messaging_connections connection join public.messaging_connection_versions resource on resource.connection_id=connection.id and resource.tribe_id=connection.tribe_id and resource.version=${context.connectionVersion} where connection.id=${context.connectionId} and connection.tribe_id=${context.tribeId} for share of connection,resource`)).rows[0];
    if(!row||row.version!==input.expectedVersion)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
    const candidate=(await database.execute<{id:string}>(sql`select id from public.tenant_messaging_connections where tribe_id=${context.tribeId} and is_candidate for share`)).rows[0];
    if(candidate&&candidate.id!==context.connectionId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
    const senderId=input.channel===MESSAGING_PUBLIC_CHANNEL.email?row.email_sender_id:input.channel===MESSAGING_PUBLIC_CHANNEL.sms?row.sms_sender_id:row.whatsapp_sender_id;
    const changed=senderId!==input.senderId||input.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp&&(row.whatsapp_template_id!==input.templateId||row.whatsapp_template_language!==input.templateLanguage);
    return{row,changed,now:authority.now};
  }
  /** @param context - Current protected scope. @param input - Original stable intent. @returns Confirmed replay before CAS, or no-secret current change facts. */
  async prepare(context:AuthorizedMessagingContext,input:MessagingConnectionConfigurationInput){
    try{
      const original=await this.ledger(context).read(this.command(context,input),messagingConnectionConfigurationSchema);
      if(original?.state==="completed")return original;
      if(original?.state==="started"){
        const currentLease=await executeMessagingLedger(()=>this.execute(context,async(database)=>{
          await this.authorize(database,context);
          const operation=(await database.execute<{lease_until:Date|string|null}>(sql`select lease_until from public.academy_admission_operations where actor_user_id=${context.actorUserId} and tribe_id=${context.tribeId} and operation_type=${REAUTHENTICATION_OPERATION.configureMessagingConnection} and idempotency_key=${input.operationId} and state='started' for share`)).rows[0];
          const current=await this.authorize(database,context);
          return !operation||operation.lease_until!==null&&new Date(operation.lease_until)>current.now;
        }));
        if(currentLease)return original;
      }
      return await executeMessagingLedger(()=>this.execute(context,async(database)=>{const current=await this.current(database,context,input);await this.authorize(database,context);return{state:"prepared"as const,configurationVersion:context.connectionVersion,changed:current.changed};}));
    }catch(error){throw this.failure(error);}
  }
  /** @param context - Original exact scope, not a browser authority token. @param input - Original confirmed CAS intent. @param inspection - Private exact SDK detail evidence; null only for a no-op. @returns Atomic new version/envelope, or unchanged original metadata, without policy, diagnostic or send effects. */
  async commit(context:AuthorizedMessagingContext,input:MessagingConnectionConfigurationInput,inspection:MessagingConfigurationInspection|null){
    const ledger=this.ledger(context,true),command=this.command(context,input);
    try{
      return await ledger.run(command,messagingConnectionConfigurationSchema,async(database)=>{
        const current=await this.current(database,context,input),row=current.row;
        if(!current.changed)return{id:context.connectionId,name:row.name,version:row.version,configurationVersion:context.connectionVersion,state:row.state,maskedCredential:MESSAGING_GENERIC_CREDENTIAL_MASK,changed:false};
        if(!inspection?.credential||inspection.sender.resourceId!==input.senderId||!inspection.sender.channels.includes(input.channel)||input.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp&&(!inspection.sender.canSendWhatsappTemplates||!inspection.template?.authenticationApproved||inspection.template.resourceId!==input.templateId||inspection.template.language!==input.templateLanguage))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.missingCapability);
        const nextVersion=(await database.execute<{next_version:number}>(sql`select coalesce(max(version),0)+1 as next_version from public.messaging_connection_versions where connection_id=${context.connectionId}`)).rows[0].next_version,secretRef=randomUUID(),config=await this.readSecurityConfig();
        const envelope=await createMessagingSecretCipher(config).seal(inspection.credential,{tribeId:context.tribeId,connectionId:context.connectionId,connectionVersion:nextVersion,resourceId:secretRef});
        const authorized=await this.authorize(database,context,true),now=authorized.now,security=await this.readSecurityConfig();
        if(authorized.context.connectionVersion!==context.connectionVersion||authorized.context.secretRef!==context.secretRef||security.recoveryLocked||security.environment!==config.environment||security.securityEpoch!==config.securityEpoch||!security.keyrings.credential.keys.has(envelope.keyId))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
        const emailSenderId=input.channel===MESSAGING_PUBLIC_CHANNEL.email?input.senderId:row.email_sender_id,smsSenderId=input.channel===MESSAGING_PUBLIC_CHANNEL.sms?input.senderId:row.sms_sender_id,whatsappSenderId=input.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp?input.senderId:row.whatsapp_sender_id,templateId=input.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp?input.templateId!:row.whatsapp_template_id,templateLanguage=input.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp?input.templateLanguage!:row.whatsapp_template_language;
        await database.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,email_sender_id,sms_sender_id,whatsapp_sender_id,whatsapp_template_id,whatsapp_template_language,created_at,last_activity_at) values (${context.connectionId},${context.tribeId},${nextVersion},${context.environment},${context.securityEpoch},${secretRef},${emailSenderId},${smsSenderId},${whatsappSenderId},${templateId},${templateLanguage},${now},${now})`);
        await database.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,format,key_id,iv,ciphertext) values (${secretRef},${context.tribeId},${context.connectionId},${nextVersion},${envelope.environment},${envelope.securityEpoch},${envelope.purpose},${envelope.format},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)})`);
        await database.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,platform_restrictions) select tribe_id,connection_id,${nextVersion},channel,sender_id,template_id,template_language,case when state=${MESSAGING_CAPABILITY_PUBLIC_STATE.unavailable} then state else ${MESSAGING_CAPABILITY_PUBLIC_STATE.unprepared} end,checked_at,platform_restrictions from public.messaging_connection_capabilities where connection_id=${context.connectionId} and tribe_id=${context.tribeId} and connection_version=${context.connectionVersion} and channel<>${input.channel}`);
        await database.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,platform_restrictions) values (${context.tribeId},${context.connectionId},${nextVersion},${input.channel},${input.senderId},${input.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp?input.templateId!:null},${input.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp?input.templateLanguage!:null},${MESSAGING_CAPABILITY_PUBLIC_STATE.unprepared},${now},coalesce((select platform_restrictions from public.messaging_connection_capabilities where connection_id=${context.connectionId} and tribe_id=${context.tribeId} and connection_version=${context.connectionVersion} and channel=${input.channel}),'[]'::jsonb))`);
        const state=row.is_selected?row.state:MESSAGING_CONNECTION_STATE.draft;
        await database.execute(sql`update public.tenant_messaging_connections set version=version+1,candidate_version=${nextVersion},is_candidate=true,state=${state},updated_at=${now} where id=${context.connectionId} and tribe_id=${context.tribeId} and version=${input.expectedVersion}`);
        if(row.selected_version!==context.connectionVersion){await database.execute(sql`update public.messaging_connection_versions set retired_at=${now},purge_after=${now}::timestamptz+interval '24 hours' where connection_id=${context.connectionId} and tribe_id=${context.tribeId} and version=${context.connectionVersion}`);await database.execute(sql`update public.messaging_secret_envelopes set retired_at=${now},purge_after=${now}::timestamptz+interval '24 hours' where secret_ref=${context.secretRef}`);}
        await this.authorize(database,context,true);
        return{id:context.connectionId,name:row.name,version:input.expectedVersion+1,configurationVersion:nextVersion,state,maskedCredential:MESSAGING_GENERIC_CREDENTIAL_MASK,changed:true};
      });
    }catch(error){
      if(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved){try{const original=await ledger.read(command,messagingConnectionConfigurationSchema);if(original?.state==="completed")return original;}catch(recoveryError){throw this.failure(recoveryError);}}
      throw this.failure(error);
    }
  }
}
