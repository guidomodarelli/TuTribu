/** Commits an encrypted candidate and its original minimal result without provider access. @module postgres-messaging-connection-repository */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingConnectionCreator, MessagingConnectionCreationContext, MessagingConnectionCreationInput } from "@/src/modules/messaging/domain/repositories/messaging-connection-management";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { messagingConnectionMutationSchema, type MessagingConnectionMutationResult } from "@/src/modules/messaging/application/results/messaging-connection-mutation-result";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { MessagingConnectionOperationError } from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import { MessagingUsageOperationError } from "@/src/modules/messaging/domain/errors/messaging-usage-operation-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_GENERIC_CREDENTIAL_MASK, MESSAGING_INITIAL_PROVIDER_ID } from "@/src/modules/messaging/constants/messaging-public-contract";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { authorizeMessagingTribeManagement } from "./postgres-messaging-usage-authorizer";
import { executeMessagingLedger } from "./execute-messaging-ledger";
import { createAdmissionConnectionAuditEvent } from "@/src/modules/academy-admissions/domain/entities/admission-messaging-audit-event";
import { PostgresAdmissionAuditRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-audit-repository";

/** Keeps every phase tied to the actual current server account's guarded checkout. */
export type MessagingConnectionCreationExecutor = <Result>(context:MessagingConnectionCreationContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;

/** Creates only a draft candidate; selected state, policies, usage and provider configuration are independent. */
/** @param error - Failure of the operation. @returns Its messaging code when known, otherwise an unexpected failure. */
function knownFailureCode(error:unknown){
  if(error instanceof AdmissionOperationError)return Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===error.code)??MESSAGING_ERROR_CODE.unexpectedFailure;
  return error instanceof MessagingCryptographyError?MESSAGING_ERROR_CODE.connectionIncomplete:MESSAGING_ERROR_CODE.unexpectedFailure;
}

/**
 * @param current - Security configuration read after a write.
 * @param original - Configuration that sealed the candidate.
 * @param keyId - Credential key that sealed the envelope.
 * @returns Nothing while recovery is unlocked and the environment, epoch and sealing key are unchanged.
 * @throws AdmissionOperationError when the candidate can no longer be trusted.
 */
function assertUnchangedSecurityScope(current:MessagingSecurityConfig,original:MessagingSecurityConfig,keyId:string):void{
  if(current.recoveryLocked||current.environment!==original.environment||current.securityEpoch!==original.securityEpoch||!current.keyrings.credential.keys.has(keyId))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
}

/**
 * Reads the original result of an unresolved creation without repeating its effect.
 * @param read - Single read of the original ledger result.
 * @param error - Unresolved failure of the original attempt.
 * @param operationId - Original operation, exposed only when the outcome stays unresolved.
 * @returns The original stored result, if any.
 * @throws MessagingConnectionOperationError when the original result cannot be read.
 */
async function readOriginalResult<Value>(read:()=>Promise<Value>,error:unknown,operationId:string):Promise<Value>{
  try{return await read();}
  catch(recoveryError){
    const cause=new AggregateError([error,recoveryError],"Messaging connection original result could not be read",{cause:recoveryError});
    if(recoveryError instanceof AdmissionOperationError){
      const code=Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===recoveryError.code)??MESSAGING_ERROR_CODE.unexpectedFailure;
      throw new MessagingConnectionOperationError(code,{cause,...(code===MESSAGING_ERROR_CODE.operationUnresolved?{operationId}:{})});
    }
    throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.operationUnresolved,{cause,operationId});
  }
}

export class PostgresMessagingConnectionRepository implements MessagingConnectionCreator<MessagingConnectionMutationResult> {
  /** @param execute - Guarded actor executor for separate claim/effect/recovery transactions. @param readSecurityConfig - Explicit current external keyrings/recovery/epoch. */
  constructor(private readonly execute:MessagingConnectionCreationExecutor,private readonly readSecurityConfig:()=>Promise<MessagingSecurityConfig>) {}

  /** @param database - Current guarded transaction. @param context - Exact current server-derived tribe principal. @returns Nothing after current authorization. @throws AdmissionOperationError with a closed own outcome and private cause. */
  private async authorize(database:RequestDatabase,context:MessagingConnectionCreationContext):Promise<void> {
    // Fail closed even if a caller bypasses the static contract (casts, untyped composition).
    if((context.operation as string)!==REAUTHENTICATION_OPERATION.saveMessagingCredentials)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    try {await authorizeMessagingTribeManagement(database,context);}
    catch(error){if(error instanceof MessagingUsageOperationError)throw new AdmissionOperationError(Object.values(ADMISSION_ERROR_CODE).find((code)=>code===error.code)??ADMISSION_ERROR_CODE.unexpectedFailure,{cause:error});throw error;}
  }

  /**
   * Inserts the encrypted draft candidate inside the claimed ledger effect, rechecking authority and security scope around every write.
   * @param database - Current guarded transaction of the ledger effect.
   * @param ledgerId - Claimed ledger operation, used as the audit operation.
   * @param request - Exact current scope and boundary-normalized creation intent.
   * @returns Original minimal metadata of the new candidate.
   * @throws AdmissionOperationError with a closed own outcome.
   */
  private async insertCandidate(database:RequestDatabase,ledgerId:string,request:{context:MessagingConnectionCreationContext;input:MessagingConnectionCreationInput}) {
    const {context,input}=request;
    await this.authorize(database,context);
    await database.execute(sql`select id from public.tribes where id=${context.tribeId} for update`);
    await this.authorize(database,context);
    const candidate=(await database.execute(sql`select id from public.tenant_messaging_connections where tribe_id=${context.tribeId} and is_candidate for update`)).rows[0];
    if(candidate)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
    const config=await this.readSecurityConfig();
    if(config.recoveryLocked)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
    const connectionId=randomUUID(),secretRef=randomUUID();
    const envelope=await createMessagingSecretCipher(config).seal(input.apiKey,{tribeId:context.tribeId,connectionId,connectionVersion:1,resourceId:secretRef});
    await this.authorize(database,context);
    const current=await this.readSecurityConfig();
    assertUnchangedSecurityScope(current,config,envelope.keyId);
    const now=new Date((await database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
    await database.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,name,provider,contributed_by_user_id,state,environment,security_epoch,is_selected,is_candidate,selected_version,candidate_version,created_at,updated_at) values (${connectionId},${context.tribeId},${input.name},${input.providerId},${context.actorUserId},${MESSAGING_CONNECTION_STATE.draft},${config.environment},${config.securityEpoch},false,true,null,1,${now},${now})`);
    await database.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref) values (${connectionId},${context.tribeId},1,${config.environment},${config.securityEpoch},${secretRef})`);
    await database.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,format,key_id,iv,ciphertext) values (${secretRef},${context.tribeId},${connectionId},1,${envelope.environment},${envelope.securityEpoch},${envelope.purpose},${envelope.format},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)})`);
    await this.authorize(database,context);
    const final=await this.readSecurityConfig();
    assertUnchangedSecurityScope(final,config,envelope.keyId);
    await new PostgresAdmissionAuditRepository(database).append(createAdmissionConnectionAuditEvent({tribeId:context.tribeId,actorUserId:context.actorUserId,operationId:ledgerId,eventType:REAUTHENTICATION_OPERATION.saveMessagingCredentials,connectionId,version:1,state:MESSAGING_CONNECTION_STATE.draft,configurationVersion:1,previous:null,channel:null,rule:null,cause:null,createdAt:now}));
    return {id:connectionId,name:input.name,version:1,configurationVersion:1,state:MESSAGING_CONNECTION_STATE.draft,maskedCredential:MESSAGING_GENERIC_CREDENTIAL_MASK};
  }

  /**
   * Applies explicit creation only after the matching ledger intent and current authority.
   * @param context - Current exact session/account/tribe scope, never browser authority.
   * @param input - Boundary-normalized original credential/name intent.
   * @returns Original committed minimal metadata or durably registered unfinished work.
   * @throws MessagingConnectionOperationError with no plaintext or provider payload in its message.
   */
  async create(context:MessagingConnectionCreationContext,input:MessagingConnectionCreationInput) {
    const command={actorUserId:context.actorUserId,tribeId:context.tribeId,operationType:REAUTHENTICATION_OPERATION.saveMessagingCredentials,idempotencyKey:input.operationId,intent:{providerId:input.providerId,name:input.name,apiKey:input.apiKey,confirmed:input.confirmed}};
    const ledger=new PostgresAdmissionOperationRepository((run)=>executeMessagingLedger(()=>this.execute(context,run)),async(database)=>{await this.authorize(database,context);return true;},this.readSecurityConfig);
    try {
      // Fail closed even if a caller bypasses the static contract (casts, untyped composition).
      if((input.providerId as string)!==MESSAGING_INITIAL_PROVIDER_ID||!input.apiKey||!(input.confirmed as boolean))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      return await ledger.run(command,messagingConnectionMutationSchema,async(database,ledgerId)=>this.insertCandidate(database,ledgerId,{context,input}));
    }catch(error){
      if(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved){
        const recovered=await readOriginalResult(()=>ledger.read(command,messagingConnectionMutationSchema),error,input.operationId);
        if(recovered?.state==="completed")return recovered;
      }
      const code=knownFailureCode(error);
      throw new MessagingConnectionOperationError(code,{cause:error,...(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved?{operationId:input.operationId}:{})});
    }
  }
}
