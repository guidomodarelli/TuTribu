/** Atomically selects a fully tested production candidate and retires the previous effective resource without a provider call. @module postgres-messaging-connection-activation */
import "server-only";
import {sql} from "drizzle-orm";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConnectionActivator,MessagingConnectionActivationInput,MessagingSelectionDependencies,MessagingEffectiveSelection} from "@/src/modules/messaging/domain/repositories/messaging-connection-activation";
import type {MessagingSecurityConfig} from "../config/messaging-security-config";
import type {TenantMessagingConnection} from "@/src/modules/messaging/domain/entities/tenant-messaging-connection";
import type {MessagingConnectionVersion,MessagingConnectionCapability} from "@/src/modules/messaging/domain/entities/messaging-connection-version";
import type {ConnectionDiagnostic} from "@/src/modules/messaging/domain/entities/connection-diagnostic";
import {assessMessagingConnectionActivation} from "@/src/modules/messaging/domain/entities/tenant-messaging-connection";
import {PostgresAdmissionOperationRepository} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import {AdmissionOperationError} from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import {ADMISSION_ERROR_CODE} from "@/src/modules/academy-admissions/constants/admission-errors";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MessagingConnectionOperationError} from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_CONNECTION_STATE,MESSAGING_CONNECTION_SLOT} from "@/src/modules/messaging/constants/messaging-connection";
import {MESSAGING_CONNECTION_REPLACEMENT} from "@/src/modules/messaging/constants/messaging-connection-replacement";
import {MESSAGING_PUBLIC_CHANNEL,MESSAGING_GENERIC_CREDENTIAL_MASK} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_CONNECTION_REQUIREMENT} from "@/src/modules/messaging/constants/messaging-connection-lifecycle";
import {MESSAGE_DELIVERY_STATE} from "@/src/modules/messaging/constants/message-delivery";
import {messagingConnectionActivationSchema} from "@/src/modules/messaging/application/results/messaging-connection-activation-result";
import {authorizeMessagingSecret,messagingSecretLifetimeIsCurrent} from "./postgres-messaging-secret-authorizer";
import {PostgresMessagingAuthorizationReader} from "./postgres-messaging-authorization-reader";
import {executeMessagingLedger} from "./execute-messaging-ledger";
import {purgeVerificationMaterial} from "./postgres-verification-material-maintenance";
import {PostgresMessagingUsageRepository} from "./postgres-messaging-usage-repository";

/** Each callback retains native actor authority and the existing guarded transaction. */
export type MessagingActivationDatabaseExecutor=<Result>(context:AuthorizedMessagingContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;
/** Only consumed lifecycle fields are read; SQL rows are not schema-revalidated. */
type ConnectionRow={id:string;name:string;provider:string;contributed_by_user_id:string;version:number;state:TenantMessagingConnection["state"];state_reason:string|null;environment:string;security_epoch:string;is_selected:boolean;is_candidate:boolean;selected_version:number|null;candidate_version:number|null;retired_at:Date|string|null;created_at:Date|string;updated_at:Date|string};
type VersionRow={version:number;secret_ref:string|null;environment:string;security_epoch:string;email_sender_id:string|null;sms_sender_id:string|null;whatsapp_sender_id:string|null;whatsapp_template_id:string|null;whatsapp_template_language:string|null;credential_validation_status:MessagingConnectionVersion["credential"]["status"];credential_validated_at:Date|string|null;is_test_mode:boolean|null;retired_at:Date|string|null;created_at:Date|string};
type CapabilityRow={channel:MessagingConnectionCapability["channel"];state:MessagingConnectionCapability["state"];sender_id:string;template_id:string|null;template_language:string|null};
type DiagnosticRow={id:string;leader_user_id:string;channel:ConnectionDiagnostic["channel"];sender_id:string;template_id:string|null;template_language:string|null;outcome:ConnectionDiagnostic["outcome"];validated_at:Date|string|null};

/** Current local evidence gates selection; a changed policy cannot request an untested channel or silently enable settings. */
export class PostgresMessagingConnectionActivation implements MessagingConnectionActivator{
  /** @param execute - Actual native principal. @param readSecurityConfig - Current external security/key availability. @param composeDependencies - Feature-owned dependency adapter bound to this exact transaction. */
  constructor(private readonly execute:MessagingActivationDatabaseExecutor,private readonly readSecurityConfig:()=>Promise<MessagingSecurityConfig>,private readonly composeDependencies:(database:RequestDatabase,context:AuthorizedMessagingContext)=>MessagingSelectionDependencies){}
  /** @param database - Existing protected transaction. @param context - Current exact activation principal/resource. @returns Current SQL clock after waits, retaining exclusive tribe/resource locks and live epoch. */
  private async authorize(database:RequestDatabase,context:AuthorizedMessagingContext){
    if(context.operation!==REAUTHENTICATION_OPERATION.activateMessagingConnection||context.resourceId!==context.connectionId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    await database.execute(sql`select id from public.tribes where id=${context.tribeId} for update`);
    if(!(await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} and "expiresAt">clock_timestamp()`)).rows[0])throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    try{
      const resource=await new PostgresMessagingAuthorizationReader(database,context.sessionId,"management").getConnection(context.tribeId,context.connectionId);
      if(!resource?.secretRef||resource.retiredAt!==null)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const current={...context,connectionVersion:resource.version,secretRef:resource.secretRef},authority=await authorizeMessagingSecret(database,current,true),security=await this.readSecurityConfig();
      if(security.recoveryLocked||security.environment!==context.environment||security.securityEpoch!==context.securityEpoch||!security.keyrings.credential.keys.has(authority.keyId))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
      const now=new Date((await database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
      if(!messagingSecretLifetimeIsCurrent(authority,now))throw new AdmissionOperationError((await database.execute(sql`select id from public.session where id=${context.sessionId} and "expiresAt">clock_timestamp()`)).rows[0]?ADMISSION_ERROR_CODE.reauthenticationRequired:ADMISSION_ERROR_CODE.authenticationRequired);
      return{now,current,security};
    }catch(error){if(error instanceof MessagingSecretAccessError)throw new AdmissionOperationError(error.code,{cause:error});throw error;}
  }
  /** @param context - Current exact scope. @returns Real DB-only ledger with current authority before replay and after the effect. */
  private ledger(context:AuthorizedMessagingContext){return new PostgresAdmissionOperationRepository((run)=>executeMessagingLedger(()=>this.execute(context,run)),async(database)=>{await this.authorize(database,context);return true;},this.readSecurityConfig);}
  /** @param error - Original private failure. @returns Safe connection error preserving a genuinely registered original operation. */
  private failure(error:unknown){if(error instanceof MessagingConnectionOperationError)return error;const code=error instanceof AdmissionOperationError?Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===error.code)??MESSAGING_ERROR_CODE.unexpectedFailure:MESSAGING_ERROR_CODE.unexpectedFailure;return new MessagingConnectionOperationError(code,{cause:error,...(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved&&error.operationId?{operationId:error.operationId}:{})});}
  /** @param context - Native exact actor/session/recency/resource. @param input - Stable confirmed lifecycle CAS. @returns Original selection/retirement/dependency commit without loading plaintext, RPC or changing usage/settings flags. */
  async activate(context:AuthorizedMessagingContext,input:MessagingConnectionActivationInput){
    const command={actorUserId:context.actorUserId,tribeId:context.tribeId,operationType:REAUTHENTICATION_OPERATION.activateMessagingConnection,idempotencyKey:input.operationId,intent:{connectionId:context.connectionId,expectedVersion:input.expectedVersion,confirmed:input.confirmed}},ledger=this.ledger(context);
    try{
      return await ledger.run(command,messagingConnectionActivationSchema,async(database,ledgerId)=>{
        if(!input.confirmed)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
        const authorized=await this.authorize(database,context);
        if(authorized.current.connectionVersion!==context.connectionVersion||authorized.current.secretRef!==context.secretRef)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
        const connection=(await database.execute<ConnectionRow>(sql`select id,name,provider,contributed_by_user_id,version,state,state_reason,environment,security_epoch,is_selected,is_candidate,selected_version,candidate_version,retired_at,created_at,updated_at from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId} for update`)).rows[0];
        const version=(await database.execute<VersionRow>(sql`select version,secret_ref,environment,security_epoch,email_sender_id,sms_sender_id,whatsapp_sender_id,whatsapp_template_id,whatsapp_template_language,credential_validation_status,credential_validated_at,is_test_mode,retired_at,created_at from public.messaging_connection_versions where connection_id=${context.connectionId} and tribe_id=${context.tribeId} and version=${context.connectionVersion} for update`)).rows[0];
        if(!connection||!version)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
        const dependencies=this.composeDependencies(database,context),requiredByDependencies=await dependencies.requiredChannels(context);
        const usage=await new PostgresMessagingUsageRepository(database,async(transaction,tribeId)=>{if(tribeId!==context.tribeId)return false;await this.authorize(transaction,context);return true;}).readCountryPolicyForConnection({tribeId:context.tribeId,connectionId:context.connectionId,connectionVersion:context.connectionVersion,slot:MESSAGING_CONNECTION_SLOT.candidate});
        const capabilities=(await database.execute<CapabilityRow>(sql`select channel,state,sender_id,template_id,template_language from public.messaging_connection_capabilities where tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} order by channel for share`)).rows;
        const diagnostics=(await database.execute<DiagnosticRow>(sql`select id,leader_user_id,channel,sender_id,template_id,template_language,outcome,validated_at from public.messaging_connection_diagnostics where tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} order by id for share`)).rows;
        const current=await this.authorize(database,context),configuration={emailSenderId:version.email_sender_id,smsSenderId:version.sms_sender_id,whatsappSenderId:version.whatsapp_sender_id,whatsappTemplateId:version.whatsapp_template_id,whatsappTemplateLanguage:version.whatsapp_template_language};
        const model:TenantMessagingConnection={id:connection.id,tribeId:context.tribeId,providerId:connection.provider,leaderUserId:connection.contributed_by_user_id,version:connection.version,state:connection.state,stateReason:connection.state_reason,environment:connection.environment,securityEpoch:connection.security_epoch,isSelected:connection.is_selected,isCandidate:connection.is_candidate,selectedVersion:connection.selected_version,candidateVersion:connection.candidate_version,retiredAt:connection.retired_at?new Date(connection.retired_at):null,createdAt:new Date(connection.created_at),updatedAt:new Date(connection.updated_at)};
        const resource:MessagingConnectionVersion={connectionId:context.connectionId,tribeId:context.tribeId,version:version.version,secretRef:version.secret_ref,environment:version.environment,securityEpoch:version.security_epoch,configuration,credential:{status:version.credential_validation_status,validatedAt:version.credential_validated_at?new Date(version.credential_validated_at):null,isTestMode:version.is_test_mode},capabilities:capabilities.map((capability)=>({channel:capability.channel,state:capability.state,senderId:capability.sender_id,templateId:capability.template_id,templateLanguage:capability.template_language})),retiredAt:version.retired_at?new Date(version.retired_at):null,createdAt:new Date(version.created_at)};
        const configuredChannels=[...(configuration.emailSenderId?[MESSAGING_PUBLIC_CHANNEL.email]:[]),...(configuration.smsSenderId?[MESSAGING_PUBLIC_CHANNEL.sms]:[]),...(configuration.whatsappSenderId?[MESSAGING_PUBLIC_CHANNEL.whatsapp]:[])];
        const facts={expectedVersion:input.expectedVersion,currentLeaderUserId:context.actorUserId,environment:current.security.environment,securityEpoch:current.security.securityEpoch,recoveryLocked:current.security.recoveryLocked,requiredChannels:[...new Set([...configuredChannels,...requiredByDependencies])],usagePolicy:usage,diagnostics:diagnostics.map((diagnostic)=>({id:diagnostic.id,tribeId:context.tribeId,connectionId:context.connectionId,connectionVersion:context.connectionVersion,leaderUserId:diagnostic.leader_user_id,channel:diagnostic.channel,senderId:diagnostic.sender_id,templateId:diagnostic.template_id,templateLanguage:diagnostic.template_language,outcome:diagnostic.outcome,validatedAt:diagnostic.validated_at?new Date(diagnostic.validated_at):null}))};
        /** @param now - Current SQL clock after the preceding waits. @returns Nothing when original locked activation evidence is still valid. */
        const requireCurrentEvidence=(now:Date)=>{
          const assessment=assessMessagingConnectionActivation(model,resource,{...facts,now});
          if(!assessment.allowed)throw new AdmissionOperationError(assessment.reason===MESSAGING_CONNECTION_REQUIREMENT.versionConflict?ADMISSION_ERROR_CODE.connectionConflict:assessment.reason===MESSAGING_CONNECTION_REQUIREMENT.capabilityRequired?ADMISSION_ERROR_CODE.missingCapability:assessment.reason===MESSAGING_CONNECTION_REQUIREMENT.countriesRequired?ADMISSION_ERROR_CODE.recipientNotAllowed:ADMISSION_ERROR_CODE.connectionIncomplete);
        };
        requireCurrentEvidence(current.now);
        const selected=(await database.execute<{id:string;selected_version:number|null}>(sql`select id,selected_version from public.tenant_messaging_connections where tribe_id=${context.tribeId} and is_selected order by id for update`)).rows[0];
        const previous:MessagingEffectiveSelection|null=selected?.selected_version?{connectionId:selected.id,connectionVersion:selected.selected_version}:null,next={connectionId:context.connectionId,connectionVersion:context.connectionVersion};
        const previousDeliveries=previous?(await database.execute<{id:string}>(sql`select id from public.message_deliveries where tribe_id=${context.tribeId} and connection_id=${previous.connectionId} and connection_version=${previous.connectionVersion} order by id for update`)).rows:[];
        const policyVersion=await dependencies.replaceSelection(context,previous,next,ledgerId);
        const now=(await this.authorize(database,context)).now,purgeAfter=new Date(now.getTime()+MESSAGING_CONNECTION_REPLACEMENT.purgeLifetimeMs);
        requireCurrentEvidence(now);
        if(previous){
          await database.execute(sql`select id from public.message_deliveries where tribe_id=${context.tribeId} and connection_id=${previous.connectionId} and connection_version=${previous.connectionVersion} order by id for update`);
          await database.execute(sql`update public.message_deliveries set state=${MESSAGE_DELIVERY_STATE.cancelled},last_outcome=${MESSAGING_CONNECTION_REPLACEMENT.reason},lease_token=null,lease_until=null,version=version+1 where tribe_id=${context.tribeId} and connection_id=${previous.connectionId} and connection_version=${previous.connectionVersion} and state=${MESSAGE_DELIVERY_STATE.queued} and not exists(select 1 from public.message_delivery_attempts where delivery_id=public.message_deliveries.id)`);
          await database.execute(sql`update public.messaging_connection_versions set retired_at=${now},purge_after=${purgeAfter} where tribe_id=${context.tribeId} and connection_id=${previous.connectionId} and version=${previous.connectionVersion} and retired_at is null`);
          await database.execute(sql`update public.messaging_secret_envelopes set retired_at=${now},purge_after=${purgeAfter} where tribe_id=${context.tribeId} and connection_id=${previous.connectionId} and connection_version=${previous.connectionVersion} and retired_at is null`);
          if(previous.connectionId!==context.connectionId)await database.execute(sql`update public.tenant_messaging_connections set is_selected=false,selected_version=null,state=${MESSAGING_CONNECTION_STATE.disconnected},retired_at=${now},version=version+1,updated_at=${now} where id=${previous.connectionId} and tribe_id=${context.tribeId}`);
        }
        const changed=(await database.execute(sql`update public.tenant_messaging_connections set is_selected=true,selected_version=${context.connectionVersion},is_candidate=false,candidate_version=null,state=${MESSAGING_CONNECTION_STATE.active},state_reason=null,version=version+1,updated_at=${now} where id=${context.connectionId} and tribe_id=${context.tribeId} and version=${input.expectedVersion} returning id`)).rows[0];if(!changed)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
        await this.authorize(database,context);
        for(const delivery of previousDeliveries)await purgeVerificationMaterial(database,{limit:1,deliveryId:delivery.id});
        requireCurrentEvidence((await this.authorize(database,context)).now);
        return{id:context.connectionId,name:connection.name,version:input.expectedVersion+1,configurationVersion:context.connectionVersion,state:MESSAGING_CONNECTION_STATE.active,maskedCredential:MESSAGING_GENERIC_CREDENTIAL_MASK,replaced:previous,policyVersion};
      });
    }catch(error){if(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved){try{const original=await ledger.read(command,messagingConnectionActivationSchema);if(original?.state==="completed")return original;}catch(recoveryError){throw this.failure(recoveryError);}}throw this.failure(error);}
  }
}
