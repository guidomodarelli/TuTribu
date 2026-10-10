/** Commits diagnostic request accounting, code/outbox and original own metadata using shared local primitives. @module postgres-connection-diagnostic-issuance */
import "server-only";
import {sql} from "drizzle-orm";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {ConnectionDiagnosticIssueOperations,ConnectionDiagnosticIssueInput,ConnectionDiagnosticIssueResult} from "@/src/modules/messaging/domain/repositories/connection-diagnostic-issuance";
import type {MessagingSecurityConfig} from "../config/messaging-security-config";
import type {VerificationChallengeScope} from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import {PostgresAdmissionOperationRepository} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import {PostgresContactVerificationIssuer} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-contact-verification-issuer";
import {PostgresVerificationRequestBudget} from "./postgres-verification-request-budget";
import {PostgresMessagingContactBudgetRepository} from "./postgres-messaging-contact-budget-repository";
import {authorizeMessagingSecret,messagingSecretLifetimeIsCurrent} from "./postgres-messaging-secret-authorizer";
import {executeMessagingLedger} from "./execute-messaging-ledger";
import {AdmissionOperationError} from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MessagingDiagnosticOperationError} from "@/src/modules/messaging/domain/errors/messaging-diagnostic-operation-error";
import {MessagingUsageBudgetError} from "@/src/modules/messaging/domain/errors/messaging-usage-budget-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {VERIFICATION_ISSUANCE_OPERATION,VERIFICATION_ISSUANCE_OUTCOME} from "@/src/modules/academy-admissions/constants/verification-issuance";
import {ADMISSION_VERIFICATION_PURPOSE} from "@/src/modules/academy-admissions/constants/admission-eligibility";
import {ADMISSION_ERROR_CODE} from "@/src/modules/academy-admissions/constants/admission-errors";
import {ADMISSION_CONTACT_TYPE} from "@/src/modules/academy-admissions/constants/admission-contact";
import {ADMISSION_CONTACT_MASK,ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH} from "@/src/modules/academy-admissions/constants/admission-contact-presentation";
import {connectionDiagnosticIssuanceSchema} from "@/src/modules/messaging/application/results/connection-diagnostic-issuance-result";

/** Every callback is a short protected native transaction; none invokes the provider. */
export type DiagnosticIssuanceDatabaseExecutor=<Result>(context:AuthorizedMessagingContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;
/** Reuses issuance primitives while keeping diagnostic authority, proof isolation and transport ownership in messaging. */
export class PostgresConnectionDiagnosticIssuance implements ConnectionDiagnosticIssueOperations{
  /** @param execute - Exact current native actor executor. @param readSecurityConfig - Current external epoch/recovery and purpose-separated keyrings. */
  constructor(private readonly execute:DiagnosticIssuanceDatabaseExecutor,private readonly readSecurityConfig:()=>Promise<MessagingSecurityConfig>){}
  /** @param database - Existing protected transaction. @param context - Current exact sensitive leader scope. @returns Nothing while current actor/session/recency/resource/epoch remain authorized. */
  private async authorize(database:RequestDatabase,context:AuthorizedMessagingContext):Promise<void>{
    if(context.operation!==REAUTHENTICATION_OPERATION.diagnoseMessagingConnection||context.resourceId!==context.connectionId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    if(!(await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} and "expiresAt">clock_timestamp()`)).rows[0])throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    try{
      const authority=await authorizeMessagingSecret(database,context),security=await this.readSecurityConfig();
      if(security.recoveryLocked||security.environment!==context.environment||security.securityEpoch!==context.securityEpoch||!security.keyrings.credential.keys.has(authority.keyId))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
      const now=new Date((await database.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now);
      if(!messagingSecretLifetimeIsCurrent(authority,now))throw new AdmissionOperationError((await database.execute(sql`select id from public.session where id=${context.sessionId} and "expiresAt">clock_timestamp()`)).rows[0]?ADMISSION_ERROR_CODE.reauthenticationRequired:ADMISSION_ERROR_CODE.authenticationRequired);
    }catch(error){if(error instanceof MessagingSecretAccessError)throw new AdmissionOperationError(error.code,{cause:error});throw error;}
  }
  /** @param context - Current exact authority. @param input - Original canonical destination/CAS/consent. @returns Atomically committed challenge/outbox/original metadata; no RPC or code in public result. */
  async issue(context:AuthorizedMessagingContext,input:ConnectionDiagnosticIssueInput){
    const authorize=async(database:RequestDatabase)=>{await this.authorize(database,context);return true;};
    const ledger=new PostgresAdmissionOperationRepository((run)=>executeMessagingLedger(()=>this.execute(context,run)),authorize,this.readSecurityConfig);
    const operationType=input.currentChallengeId?VERIFICATION_ISSUANCE_OPERATION.resend:VERIFICATION_ISSUANCE_OPERATION.issue;
    const command={actorUserId:context.actorUserId,tribeId:context.tribeId,operationType,idempotencyKey:input.operationId,intent:{purpose:ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic,connectionId:context.connectionId,expectedVersion:input.expectedVersion,channel:input.channel,recipient:input.recipient.value,contactType:input.recipient.type,country:input.recipient.type===ADMISSION_CONTACT_TYPE.phone?input.recipient.country:null,currentChallengeId:input.currentChallengeId??null,confirmed:input.confirmed}};
    try{
      return await ledger.run(command,connectionDiagnosticIssuanceSchema,async(database,ledgerId):Promise<ConnectionDiagnosticIssueResult>=>{
        if(!input.confirmed)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
        const connection=(await database.execute<{version:number}>(sql`select version from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId}`)).rows[0];
        if(!connection||connection.version!==input.expectedVersion)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
        const scope:VerificationChallengeScope={userId:context.actorUserId,tribeId:context.tribeId,connectionId:context.connectionId,connectionVersion:context.connectionVersion,securityEpoch:context.securityEpoch,purpose:ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic,verificationEpoch:null,channel:input.channel,contact:input.recipient};
        const ownsScope=async(transaction:RequestDatabase,current:VerificationChallengeScope)=>{if(current.userId!==scope.userId||current.tribeId!==scope.tribeId||current.connectionId!==scope.connectionId||current.connectionVersion!==scope.connectionVersion||current.securityEpoch!==scope.securityEpoch||current.purpose!==scope.purpose||current.verificationEpoch!==null||current.channel!==scope.channel||current.contact.type!==scope.contact.type||current.contact.value!==scope.contact.value)return false;await authorize(transaction);return true;};
        const contacts=new PostgresMessagingContactBudgetRepository(database,authorize,this.readSecurityConfig),budget=new PostgresVerificationRequestBudget(database,async(transaction,budgetCommand)=>ownsScope(transaction,budgetCommand.scope),contacts);
        const result=await new PostgresContactVerificationIssuer(database,ownsScope,this.readSecurityConfig,budget).issue({scope,operationId:input.operationId,ledgerId,expectedCurrentChallengeId:input.currentChallengeId??null});
        if(result.outcome===VERIFICATION_ISSUANCE_OUTCOME.denied)return{outcome:"denied",code:Object.values(MESSAGING_ERROR_CODE).find((code)=>code===result.code)??MESSAGING_ERROR_CODE.unexpectedFailure};
        if(!result.diagnosticId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
        const maskedDestination=scope.contact.type===ADMISSION_CONTACT_TYPE.phone?`${ADMISSION_CONTACT_MASK}${scope.contact.value.slice(-ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH)}`:`${Array.from(scope.contact.value)[0]??""}${ADMISSION_CONTACT_MASK}@${scope.contact.value.split("@").at(-1)??""}`;
        return{outcome:"issued",diagnosticId:result.diagnosticId,challengeId:result.challengeId,deliveryId:result.deliveryId,connectionId:context.connectionId,connectionVersion:context.connectionVersion,channel:input.channel,maskedDestination,expiresAt:result.expiresAt.toISOString(),resendAllowedAt:result.resendAllowedAt.toISOString()};
      });
    }catch(error){
      const code=error instanceof AdmissionOperationError?Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===error.code)??MESSAGING_ERROR_CODE.unexpectedFailure:error instanceof MessagingUsageBudgetError?error.code:MESSAGING_ERROR_CODE.unexpectedFailure;
      throw new MessagingDiagnosticOperationError(code,{cause:error,...(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved&&error.operationId?{operationId:error.operationId}:{})});
    }
  }
}
