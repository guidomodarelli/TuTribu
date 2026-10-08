/** Commits preparation and final credential facts separately from the provider RPC. @module postgres-messaging-credential-validation */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingCredentialValidationOperations,MessagingCredentialValidationInput,MessagingCredentialValidationOutcome } from "@/src/modules/messaging/domain/repositories/messaging-credential-validation";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionOperationCommand } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MessagingConnectionOperationError } from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_CREDENTIAL_VALIDATION_OPERATION,MESSAGING_CREDENTIAL_MODE } from "@/src/modules/messaging/constants/messaging-credential-validation";
import { MESSAGING_CREDENTIAL_PUBLIC_STATE } from "@/src/modules/messaging/constants/messaging-public-contract";
import { CODE_REQUEST_EVENT } from "@/src/modules/messaging/constants/code-request-budget";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { messagingCredentialPreparationSchema,messagingCredentialValidationSchema } from "@/src/modules/messaging/application/results/messaging-credential-validation-result";
import { authorizeMessagingSecret,messagingSecretLifetimeIsCurrent } from "./postgres-messaging-secret-authorizer";
import { executeMessagingLedger } from "./execute-messaging-ledger";

/** Each callback is an actual guarded transaction; none may run a provider request. */
export type CredentialValidationDatabaseExecutor=<Result>(context:AuthorizedMessagingContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;

/** Uses separate ledger namespaces for accounting eligibility and final inspection metadata. */
export class PostgresMessagingCredentialValidation implements MessagingCredentialValidationOperations {
  /** @param execute - Current native principal's guarded DB executor. @param readSecurityConfig - Explicit current external recovery/epoch/keyrings. */
  constructor(private readonly execute:CredentialValidationDatabaseExecutor,private readonly readSecurityConfig:()=>Promise<MessagingSecurityConfig>){}

  /** @param database - Current locked transaction. @param context - Exact validation principal/resource. @param mutate - Whether resources must be exclusively locked from the first read. @returns Current SQL time after waits. @throws AdmissionOperationError preserving current authority/lifetime failures. */
  private async authorize(database:RequestDatabase,context:AuthorizedMessagingContext,mutate=false):Promise<Date>{
    if(context.operation!==MESSAGING_CREDENTIAL_VALIDATION_OPERATION.complete||context.resourceId!==context.connectionId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    const session=(await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} and "expiresAt">clock_timestamp()`)).rows[0];
    if(!session)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    try{
      const authority=await authorizeMessagingSecret(database,context,mutate),config=await this.readSecurityConfig();
      if(config.recoveryLocked||config.environment!==context.environment||config.securityEpoch!==context.securityEpoch||!config.keyrings.credential.keys.has(authority.keyId))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
      const now=new Date((await database.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now);
      if(!messagingSecretLifetimeIsCurrent(authority,now)){
        const sessionStillLive=(await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} and "expiresAt">clock_timestamp()`)).rows[0];
        throw new AdmissionOperationError(sessionStillLive?ADMISSION_ERROR_CODE.reauthenticationRequired:ADMISSION_ERROR_CODE.authenticationRequired);
      }
      return now;
    }catch(error){if(error instanceof MessagingSecretAccessError){const sessionStillLive=(await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} and "expiresAt">clock_timestamp()`)).rows[0];throw new AdmissionOperationError(sessionStillLive?error.code:ADMISSION_ERROR_CODE.authenticationRequired,{cause:error});}throw error;}
  }

  /** @param context - Current exact private scope. @param input - Original caller intent. @param operationType - Fixed internal stage namespace. @returns Stable MAC input without private key or inspection payload. */
  private command(context:AuthorizedMessagingContext,input:MessagingCredentialValidationInput,operationType:string):AdmissionOperationCommand{
    return{actorUserId:context.actorUserId,tribeId:context.tribeId,operationType,idempotencyKey:input.operationId,intent:{connectionId:context.connectionId,expectedVersion:input.expectedVersion,confirmed:input.confirmed}};
  }
  /** @param context - Current private scope. @param mutate - Fixed exclusive locking for final metadata. @returns Real DB-only ledger with current authorization at every stage. */
  private ledger(context:AuthorizedMessagingContext,mutate=false){return new PostgresAdmissionOperationRepository((run)=>executeMessagingLedger(()=>this.execute(context,run)),async(database)=>{await this.authorize(database,context,mutate);return true;},this.readSecurityConfig);}
  /** @param error - Real private failure. @returns Closed outcome preserving only genuinely registered progress. */
  private failure(error:unknown):MessagingConnectionOperationError{
    if(error instanceof MessagingConnectionOperationError)return error;
    const code=error instanceof AdmissionOperationError?Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===error.code)??MESSAGING_ERROR_CODE.unexpectedFailure:MESSAGING_ERROR_CODE.unexpectedFailure;
    return new MessagingConnectionOperationError(code,{cause:error,...(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved&&error.operationId?{operationId:error.operationId}:{})});
  }

  /** @param context - Current exact private authority. @param input - Original stable intent. @returns Final original metadata or absence, without SDK/key loading. */
  async read(context:AuthorizedMessagingContext,input:MessagingCredentialValidationInput){
    try{return await this.ledger(context).read(this.command(context,input,MESSAGING_CREDENTIAL_VALIDATION_OPERATION.complete),messagingCredentialValidationSchema);}
    catch(error){throw this.failure(error);}
  }

  /** @param context - Current exact private authority. @param input - Original stable intent. @returns Historical final result or one committed private accounting identity. */
  async prepare(context:AuthorizedMessagingContext,input:MessagingCredentialValidationInput){
    try{
      const final=await this.read(context,input);if(final?.state===OPERATION_STATE.completed)return final;
      const command=this.command(context,input,MESSAGING_CREDENTIAL_VALIDATION_OPERATION.prepare);
      const result=await this.ledger(context).run(command,messagingCredentialPreparationSchema,async(database)=>{
        const row=(await database.execute<{version:number}>(sql`select version from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId}`)).rows[0];
        if(!row||row.version!==input.expectedVersion)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
        return{id:context.connectionId,configurationVersion:context.connectionVersion,expectedVersion:input.expectedVersion};
      });
      if(result.state!==OPERATION_STATE.completed)return result;
      const validationId=await executeMessagingLedger(()=>this.execute(context,async(database)=>{
        await this.authorize(database,context);
        const row=(await database.execute<{id:string}>(sql`select id from public.academy_admission_operations where actor_user_id=${context.actorUserId} and tribe_id=${context.tribeId} and operation_type=${MESSAGING_CREDENTIAL_VALIDATION_OPERATION.prepare} and idempotency_key=${input.operationId} and state=${OPERATION_STATE.completed} for share`)).rows[0];
        if(!row)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved,{operationId:input.operationId});
        await this.authorize(database,context);return row.id;
      }));
      return{state:"prepared"as const,validationId,configurationVersion:result.result.configurationVersion};
    }catch(error){throw this.failure(error);}
  }

  /** @param context - Exact original validated resource. @param input - Original stable caller intent. @param validationId - Committed private preparation/budget identity. @param outcome - Adapter-consumed private facts or a safe provider failure. @returns Atomic credential facts and frozen public result, without preparing or activating channels. */
  async complete(context:AuthorizedMessagingContext,input:MessagingCredentialValidationInput,validationId:string,outcome:MessagingCredentialValidationOutcome){
    const ledger=this.ledger(context,true),command=this.command(context,input,MESSAGING_CREDENTIAL_VALIDATION_OPERATION.complete);
    try{
      return await ledger.run(command,messagingCredentialValidationSchema,async(database)=>{
        const preparation=(await database.execute<{public_result:unknown}>(sql`select public_result from public.academy_admission_operations where id=${validationId} and actor_user_id=${context.actorUserId} and tribe_id=${context.tribeId} and operation_type=${MESSAGING_CREDENTIAL_VALIDATION_OPERATION.prepare} and idempotency_key=${input.operationId} and state=${OPERATION_STATE.completed} for share`)).rows[0];
        const budget=(await database.execute(sql`select id from public.messaging_usage_events where operation_id=${validationId} and event_type=${CODE_REQUEST_EVENT.credential} and actor_user_id=${context.actorUserId} and tribe_id=${context.tribeId} and credential_connection_id=${context.connectionId} and credential_connection_version=${context.connectionVersion} for share`)).rows[0];
        if(!preparation||!budget)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
        const original=messagingCredentialPreparationSchema.safeParse(preparation.public_result);
        if(!original.success||original.data.id!==context.connectionId||original.data.configurationVersion!==context.connectionVersion||original.data.expectedVersion!==input.expectedVersion)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict);
        const row=(await database.execute<{version:number}>(sql`select version from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId}`)).rows[0];
        if(!row||row.version!==input.expectedVersion)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
        const now=await this.authorize(database,context,true);
        const credentialState=outcome.ok?MESSAGING_CREDENTIAL_PUBLIC_STATE.valid:outcome.code===MESSAGING_ERROR_CODE.invalidCredentials?MESSAGING_CREDENTIAL_PUBLIC_STATE.invalid:MESSAGING_CREDENTIAL_PUBLIC_STATE.unavailable;
        await database.execute(sql`update public.messaging_connection_versions set credential_validation_status=${credentialState},credential_validated_at=${now},is_test_mode=${outcome.ok?outcome.inspection.isTestMode:null},provider_project_ref=${outcome.ok?outcome.inspection.projectId:null},provider_team_ref=${outcome.ok?outcome.inspection.teamId:null},provider_key_ref=${outcome.ok?outcome.inspection.apiKeyId:null},last_activity_at=${now} where connection_id=${context.connectionId} and tribe_id=${context.tribeId} and version=${context.connectionVersion}`);
        await database.execute(sql`update public.tenant_messaging_connections set version=version+1,updated_at=${now} where id=${context.connectionId} and tribe_id=${context.tribeId} and version=${input.expectedVersion}`);
        await this.authorize(database,context,true);
        return{id:context.connectionId,version:input.expectedVersion+1,configurationVersion:context.connectionVersion,credentialState,credentialMode:outcome.ok?outcome.inspection.isTestMode?MESSAGING_CREDENTIAL_MODE.test:MESSAGING_CREDENTIAL_MODE.production:MESSAGING_CREDENTIAL_MODE.unknown,validatedAt:now.toISOString(),...(!outcome.ok?{failureCode:outcome.code}:{})};
      });
    }catch(error){
      if(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved){
        try{const original=await ledger.read(command,messagingCredentialValidationSchema);if(original?.state===OPERATION_STATE.completed)return original;}
        catch(recoveryError){if(recoveryError instanceof AdmissionOperationError)throw this.failure(recoveryError);throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.operationUnresolved,{cause:new AggregateError([error,recoveryError],"Credential validation result could not be reconciled",{cause:error}),operationId:input.operationId});}
      }
      throw this.failure(error);
    }
  }
}
