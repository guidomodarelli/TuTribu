/** Composes native account/policy authority with real issuance and local verification in the original operation transaction. @module postgres-admission-contact-verification-operations */
import "server-only";
import {sql} from "drizzle-orm";
import type {z} from "zod";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { LegacyAdmissionInvitationReader } from "../../domain/repositories/legacy-admission-invitation-reader";
import { MANUAL_ADMISSION_EXECUTION_CAPABILITIES } from "../../constants/admission-execution-capabilities";
import type {AdmissionContactVerificationOperations,AdmissionVerificationAccountScope,AdmissionChallengeIssuanceIntent,AdmissionChallengeVerificationIntent,AdmissionChallengeResendIntent} from "../../domain/repositories/admission-contact-verification";
import type { AdmissionCurrentChallengeReader, AdmissionCurrentChallengeQuery } from "../../domain/repositories/admission-current-challenge-reader";
import { admissionCurrentChallengeSelectionSchema } from "../../application/results/admission-current-challenge-schemas";
import type {VerificationChallengeScope} from "../../domain/entities/contact-verification-challenge";
import {admissionContactStoredValues} from "../../domain/value-objects/admission-contact";
import type {AdmissionPolicy} from "../../domain/entities/admission-policy";
import type {AdmissionVerificationProof} from "../../domain/entities/admission-verification-proof";
import {createAdmissionResourceAuditEvent} from "../../domain/entities/admission-resource-audit-event";
import {ADMISSION_AUDIT_RESOURCE_TYPE} from "../../constants/admission-audit";
import { getAdmissionRetryAllowedAt } from "../../domain/entities/admission-request";
import type {AdmissionOperationCommand,AdmissionOperationResult} from "../../domain/entities/admission-operation";
import type {AdmissionProofApplicationOperations,AdmissionProofApplicationIntent} from "../../domain/repositories/admission-verification-proof-repository";
import type {MessagingSecurityConfig} from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import {authorizeAdmissionApplicant,withAdmissionApplicantSavepointSection,withReusedAdmissionApplicantAuthority} from "./postgres-admission-applicant-authority";
import {PostgresAdmissionOperationRepository} from "./postgres-admission-operation-repository";
import { rejectWithoutPlatformSecurity } from "./admission-platform-security-rejection";
import {PostgresAdmissionAuditRepository} from "./postgres-admission-audit-repository";
import {PostgresContactVerificationIssuer} from "./postgres-contact-verification-issuer";
import {PostgresContactVerificationRepository} from "./postgres-contact-verification-repository";
import {PostgresMessagingContactBudgetRepository} from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import {PostgresVerificationRequestBudget} from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-request-budget";
import {PostgresVerificationFailureBudget} from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-failure-budget";
import {admissionIssuanceSnapshotSchema,admissionChallengeVerificationSnapshotSchema} from "../../application/results/admission-contact-verification-schemas";
import {admissionProofApplicationSnapshotSchema} from "../../application/results/admission-proof-application-schemas";
import {PostgresAdmissionVerificationProofWriter} from "./postgres-admission-verification-proof-writer";
import {ADMISSION_PROOF_OPERATION,ADMISSION_PROOF_CREATION_AUDIT_EVENT} from "../../constants/admission-proof";
import {readLockedAdmissionPolicyGate} from "./postgres-admission-policy-storage";
import {AdmissionOperationError} from "../../domain/errors/admission-operation-error";
import {ADMISSION_ERROR_CODE} from "../../constants/admission-errors";
import {ADMISSION_VERIFICATION_PURPOSE} from "../../constants/admission-eligibility";
import {ADMISSION_CONTACT_TYPE} from "../../constants/admission-contact";
import {ADMISSION_CONTACT_MASK,ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH} from "../../constants/admission-contact-presentation";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {ADMISSION_REQUEST_SOURCE,ADMISSION_REQUEST_STATUS} from "../../constants/admission-request";
import {ADMISSION_CONTACT_VERIFICATION_OPERATION,ADMISSION_CONTACT_VERIFICATION_DENIAL_CODE,ADMISSION_ISSUANCE_EFFECT_SQL} from "../../constants/admission-contact-verification";
import {VERIFICATION_ISSUANCE_OPERATION,VERIFICATION_ISSUANCE_OUTCOME} from "../../constants/verification-issuance";
import {VERIFICATION_TRANSITION_OUTCOME,VERIFICATION_CHALLENGE_REASON,VERIFICATION_CHALLENGE_STATE} from "../../constants/verification-challenge";
import {ADMISSION_LIMIT} from "../../constants/admission-limits";
import {MESSAGE_DELIVERY_STATE} from "@/src/modules/messaging/constants/message-delivery";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE} from "@/src/modules/messaging/constants/messaging-cryptography";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import {TRIBE_ACCESS_MODEL} from "@/src/modules/product-access/constants/product-access";
import {evaluateAcademyMembershipEligibility,type AcademyMembershipStateFacts} from "@/src/modules/tribes/domain/value-objects/academy-membership-eligibility";
import {ACADEMY_MEMBERSHIP_ELIGIBILITY} from "@/src/modules/tribes/constants/academy-membership";
import {resolvePersonalInvitationForRedemption,assertPersonalInvitationTokenCurrent,type ResolvedPersonalInvitation} from "./postgres-personal-invitation-redemption";
import {authorizePersonalContactIssuance} from "./authorize-personal-contact-issuance";

/** Each checkout binds the actual server actor and never trusts a client-selected database context. */
export type AdmissionVerificationDatabaseExecutor=<Result>(scope:AdmissionVerificationAccountScope,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;
/** Only the basic membership facts of the shared eligibility rule are read; the row is not schema-validated. */
type AcademyMembershipStateRow={role:AcademyMembershipStateFacts["role"];status:AcademyMembershipStateFacts["status"];status_reason:string;commercial_recovery_status:AcademyMembershipStateFacts["commercialRecoveryStatus"]};
/** Only immutable scope fields are consumed; PostgreSQL rows are not schema-revalidated. */
type ChallengeScopeRow={id:string;user_id:string;tribe_id:string;purpose:string;contact_type:"email"|"phone";normalized_contact:string;recipient_country:string|null;channel:"email"|"sms"|"whatsapp";verification_epoch:number;connection_id:string;connection_version:number;security_epoch:string};
/** Only the current pending contact/source/time facts are consumed; requesting a code cannot mutate them. */
type PendingIssuanceRow={status:string;source:string;contact_type:string|null;normalized_contact:string|null;expires_at:Date|string};
/** Private prepared code origin is separate from the public scope and original token material. */
type PreparedAdmissionIssuance={scope:VerificationChallengeScope;personal:ResolvedPersonalInvitation|null;policy:AdmissionPolicy};

/** Owns metadata, budgets and proof effects; no method decrypts a BYOK credential or invokes SDK. */
export class PostgresAdmissionContactVerificationOperations implements AdmissionContactVerificationOperations,AdmissionProofApplicationOperations,AdmissionCurrentChallengeReader{
  /** @param execute - Current native request actor checkout. @param readSecurityConfig - Explicit current server keyrings/environment without an outbound call. @param createLegacyInvitations - Optional own attribution adapter composed on the original transaction; absence keeps legacy closed. */
  constructor(execute:AdmissionVerificationDatabaseExecutor,private readonly readSecurityConfig:()=>Promise<MessagingSecurityConfig>,private readonly createLegacyInvitations?:(database:RequestDatabase)=>LegacyAdmissionInvitationReader){
    // Every transaction this owner opens (preflight, ledger claim, effect and recovery) lets its repeated applicant checks reuse the locks of its first one.
    this.execute=(scope,run)=>execute(scope,(database)=>withReusedAdmissionApplicantAuthority(database,()=>run(database)));
  }
  /** Current native request actor checkout, scoped for applicant authority reuse. */
  private readonly execute:AdmissionVerificationDatabaseExecutor;

  /** @param database - Current guarded transaction. @param context - Original server-derived account/session/tribe. @returns Current native account facts after shared scope locks and fresh SQL session time, reusing this transaction's held locks after its first check. */
  private authorize(database:RequestDatabase,context:AdmissionVerificationAccountScope){return authorizeAdmissionApplicant(database,context);}

  /** @param database - Original authorized transaction. @param context - Exact native scope. @param sending - Whether current opening is needed for a new outbound obligation. @returns Current ON policy without initializing or enabling any setting. */
  private async policy(database:RequestDatabase,context:AdmissionVerificationAccountScope,sending:boolean):Promise<AdmissionPolicy>{
    await this.authorize(database,context);
    return this.currentPolicy(database,context,sending);
  }

  /** @param database - Transaction whose applicant authority was just checked, with no other read in between. @param context - Exact native scope. @param sending - Whether current opening is needed for a new outbound obligation. @returns Current ON policy without initializing or enabling any setting. */
  private async currentPolicy(database:RequestDatabase,context:AdmissionVerificationAccountScope,sending:boolean):Promise<AdmissionPolicy>{
    const {settings,policy,marker}=await readLockedAdmissionPolicyGate(database,context.tribeId);
    if(settings?.access_model!==TRIBE_ACCESS_MODEL.academy||!settings.admission_enabled||!marker||!policy?.activatedAt)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionsPaused);
    if(!policy.requiresAdditionalVerification)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if(sending&&!policy.isOpen)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionsPaused);
    if(sending)await this.assertCodeMembershipEligible(database,context);
    return policy;
  }

  /**
   * Applies the same basic membership rule as the overview and the request writer: a member needs no code, a known commercial
   * tribemate recovers its access through the request, and any other restriction needs authorized help.
   * @param database - Transaction whose applicant authority was just checked. @param context - Exact native scope.
   * @returns Nothing for an applicant without membership or with a recoverable one.
   * @throws AdmissionOperationError when the account is already a member or its membership cannot be recovered by admission.
   */
  private async assertCodeMembershipEligible(database:RequestDatabase,context:AdmissionVerificationAccountScope):Promise<void>{
    const member=(await database.execute<AcademyMembershipStateRow>(sql`select role,status,status_reason,commercial_recovery_status from public.tribe_members where tribe_id=${context.tribeId} and user_id=${context.userId} for share`)).rows[0];
    const eligibility=evaluateAcademyMembershipEligibility(member?{role:member.role,status:member.status,statusReason:member.status_reason,commercialRecoveryStatus:member.commercial_recovery_status}:null);
    if(eligibility.outcome===ACADEMY_MEMBERSHIP_ELIGIBILITY.alreadyMember)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
    if(eligibility.outcome===ACADEMY_MEMBERSHIP_ELIGIBILITY.blocked)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.membershipRecoveryRequired);
  }

  /** @param context - Original native account scope. @returns Real ledger whose authorizer retains current actor/session authority before replay, claim and mutation. */
  private ledger(context:AdmissionVerificationAccountScope){return new PostgresAdmissionOperationRepository((run)=>this.execute(context,run),async(database)=>{await this.authorize(database,context);return true;},this.readSecurityConfig);}

  /** @typeParam Result - Own original snapshot guarded before commit and recovery. @param ledger - Existing native owner ledger. @param command - Exact original namespace and intent. @param schema - Own snapshot contract. @param mutate - Original DB-only business callback. @returns Confirmed original or genuine progress without repeating a lost commit. */
  private async run<Result>(ledger:PostgresAdmissionOperationRepository,command:AdmissionOperationCommand,schema:z.ZodType<Result>,mutate:(database:RequestDatabase,ledgerId:string)=>Promise<unknown>):Promise<AdmissionOperationResult<Result>>{
    try{return await ledger.run(command,schema,mutate);}
    catch(error){
      if(!(error instanceof AdmissionOperationError)||error.code!==ADMISSION_ERROR_CODE.operationUnresolved)throw error;
      try{const original=await ledger.read(command,schema);if(original?.state===OPERATION_STATE.completed)return original;}
      catch(recoveryError){if(recoveryError instanceof AdmissionOperationError&&recoveryError.code!==ADMISSION_ERROR_CODE.operationUnresolved)throw recoveryError;throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved,{operationId:command.idempotencyKey,cause:new AggregateError([error,recoveryError],"Admission contact operation recovery could not confirm its original commit",{cause:error})});}
      throw error;
    }
  }

  /** @param database - Original transaction. @param input - Confirmed current contact and source proposal. @returns Actual chosen resource scope after the policy version and native email are checked. */
  private async issuanceScope(database:RequestDatabase,input:Omit<AdmissionChallengeIssuanceIntent,"operationId">):Promise<PreparedAdmissionIssuance>{
    const account=await this.authorize(database,input),policy=await this.currentPolicy(database,input,true);
    if(policy.version!==input.expectedPolicyVersion)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
    if(!MANUAL_ADMISSION_EXECUTION_CAPABILITIES.sources.includes(input.source.kind))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
    if(input.contact.type!==policy.contactType)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if(input.contact.type===ADMISSION_CONTACT_TYPE.email?input.channel!==MESSAGING_PUBLIC_CHANNEL.email||input.contact.value!==account.normalizedEmail:input.channel===MESSAGING_PUBLIC_CHANNEL.email||input.channel!==policy.phoneChannel&&!(input.channel===MESSAGING_PUBLIC_CHANNEL.sms&&policy.phoneChannel===MESSAGING_PUBLIC_CHANNEL.whatsapp&&policy.allowSmsAlternative))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if(!policy.messagingConnectionId||!policy.messagingConnectionVersion)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
    const config=await this.readSecurityConfig();
    const personal=input.source.kind===ADMISSION_REQUEST_SOURCE.personal?await resolvePersonalInvitationForRedemption(database,input,input.source.token,config):null;
    if(input.source.kind===ADMISSION_REQUEST_SOURCE.legacy&&!input.admissionRequestId){
      const attribution=await this.createLegacyInvitations?.(database).findActiveByToken({userId:input.userId,sessionId:input.sessionId,tribeId:input.tribeId,token:input.source.token});
      if(!attribution)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
    }
    if(personal)await authorizePersonalContactIssuance(database,input,{invitationId:personal.invitation.id,contact:input.contact,security:config});
    else if(input.admissionRequestId)await this.assertPendingIssuance(database,input,input.admissionRequestId,input.contact);
    return{scope:{userId:input.userId,tribeId:input.tribeId,purpose:ADMISSION_VERIFICATION_PURPOSE.admission,contact:input.contact,verificationEpoch:policy.verificationEpoch,connectionId:policy.messagingConnectionId,connectionVersion:policy.messagingConnectionVersion,securityEpoch:config.securityEpoch,channel:input.channel},personal,policy};
  }

  /** @param input - Own canonical contact and prior request proposed by the native use case. @returns Safe exact-contact original only after terminal/cadence/context checks, without claiming work or consuming quota. */
  async readCurrent(input: AdmissionCurrentChallengeQuery) {
    return rejectWithoutPlatformSecurity(() => this.execute(input, async (database) => {
      const prepared = await this.issuanceScope(database, { ...input, confirmed: true, admissionRequestId: null, source: { kind: ADMISSION_REQUEST_SOURCE.common } });
      const previous = (await database.execute<{ id: string; status: "pending" | "approved" | "rejected" | "cancelled" | "expired"; source: string; submitted_at: Date | string; expires_at: Date | string; resolved_at: Date | string | null; retry_allowed_at: Date | string | null }>(sql`select request.id,request.status,request.source,request.submitted_at,request.expires_at,(select decided_at from public.academy_admission_decisions where id=request.decision_id) as resolved_at,request.retry_allowed_at from public.academy_admission_requests request where request.tribe_id=${input.tribeId} and request.user_id=${input.userId} order by request.submitted_at desc,request.id desc limit 1 for share of request`)).rows[0];
      const now = new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      if (previous?.id !== input.previousRequestId || previous.source !== ADMISSION_REQUEST_SOURCE.common && previous.source !== ADMISSION_REQUEST_SOURCE.legacy || previous.status === ADMISSION_REQUEST_STATUS.approved || previous.status === ADMISSION_REQUEST_STATUS.pending && now < new Date(previous.expires_at)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
      if (now < getAdmissionRetryAllowedAt({ status: previous.status, submittedAt: new Date(previous.submitted_at), resolvedAt: previous.resolved_at ? new Date(previous.resolved_at) : null, retryAllowedAt: previous.retry_allowed_at ? new Date(previous.retry_allowed_at) : null })) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
      const row = (await database.execute<{ challenge_id: string; operation_id: string; channel: "email" | "sms" | "whatsapp"; expires_at: Date | string; created_at: Date | string; state: "queued" | "accepted" | "delivered" | "failed" | "unknown" | "suppressed" | "cancelled"; delivery_id: string; verification_epoch: number; connection_id: string; connection_version: number; security_epoch: string; personal_invitation_id: string | null; challenge_state: string; failed_attempts: number; has_mac: boolean; mac_key_id: string }>(sql`select challenge.id as challenge_id,operation.idempotency_key as operation_id,challenge.channel,challenge.expires_at,challenge.created_at,challenge.state as challenge_state,challenge.failed_attempts,challenge.code_mac is not null as has_mac,challenge.mac_key_id,delivery.state,delivery.id as delivery_id,challenge.verification_epoch,challenge.connection_id,challenge.connection_version,challenge.security_epoch,to_jsonb(challenge)->>'personal_invitation_id' as personal_invitation_id from public.contact_verification_challenges challenge join public.message_deliveries delivery on delivery.id=challenge.delivery_id and delivery.tribe_id=challenge.tribe_id join public.academy_admission_operations operation on operation.id=delivery.idempotency_key and operation.actor_user_id=challenge.user_id and operation.tribe_id=challenge.tribe_id and operation.state=${OPERATION_STATE.completed} and to_jsonb(operation)->>'verification_purpose'=${ADMISSION_VERIFICATION_PURPOSE.admission} and operation.operation_type in (${VERIFICATION_ISSUANCE_OPERATION.issue},${VERIFICATION_ISSUANCE_OPERATION.resend}) where challenge.user_id=${input.userId} and challenge.tribe_id=${input.tribeId} and challenge.purpose=${ADMISSION_VERIFICATION_PURPOSE.admission} and challenge.contact_type=${input.contact.type} and challenge.normalized_contact=${input.contact.value} and challenge.is_current`)).rows[0];
      if (!row) return { current: null };
      const currentConfig = await this.readSecurityConfig();
      // A platform recovery lock blocks every new code until the TuTribu team lifts it; it does not invalidate this challenge.
      if (currentConfig.recoveryLocked) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.platformSecurityUnavailable, { cause: new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked) });
      const channelAllowed = input.contact.type === ADMISSION_CONTACT_TYPE.email ? row.channel === MESSAGING_PUBLIC_CHANNEL.email : row.channel === prepared.policy.phoneChannel || row.channel === MESSAGING_PUBLIC_CHANNEL.sms && prepared.policy.phoneChannel === MESSAGING_PUBLIC_CHANNEL.whatsapp && prepared.policy.allowSmsAlternative;
      // A code from another origin (a personal invitation), a channel the rules no longer allow or an earlier connection, epoch or protection is no candidate: the next original issuance replaces it.
      if (row.personal_invitation_id || !channelAllowed || currentConfig.securityEpoch !== prepared.scope.securityEpoch || row.verification_epoch !== prepared.scope.verificationEpoch || row.connection_id !== prepared.scope.connectionId || row.connection_version !== prepared.scope.connectionVersion || row.security_epoch !== prepared.scope.securityEpoch) return { current: null };
      await this.authorize(database, input);
      const maskedDestination = input.contact.type === ADMISSION_CONTACT_TYPE.phone ? `${ADMISSION_CONTACT_MASK}${input.contact.value.slice(-ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH)}` : `${Array.from(input.contact.value)[0] ?? ""}${ADMISSION_CONTACT_MASK}@${input.contact.value.split("@").at(-1) ?? ""}`;
      return admissionCurrentChallengeSelectionSchema.parse({ current: { operationId: row.operation_id, requiresReplacement: row.challenge_state !== VERIFICATION_CHALLENGE_STATE.issued || !row.has_mac || !currentConfig.keyrings[MESSAGING_KEY_PURPOSE.verificationMac].keys.has(row.mac_key_id) || row.failed_attempts >= ADMISSION_LIMIT.verificationChallengeFailureCount || new Date(row.expires_at) <= new Date((await database.execute<{now: Date | string}>(sql`select clock_timestamp() as now`)).rows[0].now), challenge: { challengeId: row.challenge_id, purpose: ADMISSION_VERIFICATION_PURPOSE.admission, channel: row.channel, maskedDestination, expiresAt: new Date(row.expires_at).toISOString(), resendAllowedAt: new Date(new Date(row.created_at).getTime() + ADMISSION_LIMIT.verificationResendWaitMs).toISOString(), deliveryState: row.state, deliveryId: row.delivery_id } } });
    }));
  }

  /** @param database - Original authorized transaction. @param context - Native own account/tribe. @param requestId - Explicit own pending reference. @param contact - Canonical proposed contact. @returns Nothing while the common request remains live and contact-compatible after its lock. @throws AdmissionOperationError before creating a code for a missing, terminal, expired, foreign-source or changed-contact request. */
  private async assertPendingIssuance(database:RequestDatabase,context:AdmissionVerificationAccountScope,requestId:string,contact:VerificationChallengeScope["contact"]):Promise<void>{
    const request=(await database.execute<PendingIssuanceRow>(sql`select status,source,contact_type,normalized_contact,expires_at from public.academy_admission_requests where id=${requestId} and user_id=${context.userId} and tribe_id=${context.tribeId} for share`)).rows[0];
    if(!request)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const now=new Date((await database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
    if(request.status!==ADMISSION_REQUEST_STATUS.pending||now>=new Date(request.expires_at))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
    if(request.source!==ADMISSION_REQUEST_SOURCE.common&&request.source!==ADMISSION_REQUEST_SOURCE.legacy)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
    // A request saved before an Argentine mobile took its 9 keeps naming the same phone.
    if(request.normalized_contact!==null&&(request.contact_type!==contact.type||!admissionContactStoredValues(contact).includes(request.normalized_contact)))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.contactBindingConflict);
  }

  /** @param database - Native authorized transaction. @param context - Exact own account. @param challengeId - Original resource whose immutable contact cannot be replaced by the caller. @returns Original scope without taking an early shared challenge lock that would need an upgrade. */
  private async challengeScope(database:RequestDatabase,context:AdmissionVerificationAccountScope,challengeId:string):Promise<VerificationChallengeScope>{
    const account=await this.authorize(database,context),policy=await this.currentPolicy(database,context,false),row=(await database.execute<ChallengeScopeRow>(sql`select challenge.id,challenge.user_id,challenge.tribe_id,challenge.purpose,challenge.contact_type,challenge.normalized_contact,delivery.recipient_country,challenge.channel,challenge.verification_epoch,challenge.connection_id,challenge.connection_version,challenge.security_epoch from public.contact_verification_challenges challenge join public.message_deliveries delivery on delivery.id=challenge.delivery_id and delivery.tribe_id=challenge.tribe_id where challenge.id=${challengeId} and challenge.user_id=${context.userId} and challenge.tribe_id=${context.tribeId}`)).rows[0];
    if(row?.purpose!==ADMISSION_VERIFICATION_PURPOSE.admission||row.verification_epoch!==policy.verificationEpoch||row.contact_type!==policy.contactType||row.contact_type===ADMISSION_CONTACT_TYPE.email&&row.normalized_contact!==account.normalizedEmail)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.challengeInvalidated);
    const challengeScope={userId:context.userId,tribeId:context.tribeId,purpose:ADMISSION_VERIFICATION_PURPOSE.admission,verificationEpoch:row.verification_epoch,connectionId:row.connection_id,connectionVersion:row.connection_version,securityEpoch:row.security_epoch,channel:row.channel};
    if(row.contact_type===ADMISSION_CONTACT_TYPE.email)return{...challengeScope,contact:{type:ADMISSION_CONTACT_TYPE.email,value:row.normalized_contact}};
    if(!row.recipient_country)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    return{...challengeScope,contact:{type:ADMISSION_CONTACT_TYPE.phone,value:row.normalized_contact,country:row.recipient_country}};
  }

  /** @param database - Original guarded effect. @param context - Native request identity. @param scope - Immutable code context. @returns A mandatory scope callback rechecking actor/session (through `policy`) and policy after waits and crypto. */
  private ownsScope(database:RequestDatabase,context:AdmissionVerificationAccountScope,scope:VerificationChallengeScope){return async(current:RequestDatabase,candidate:VerificationChallengeScope)=>{const policy=await this.policy(current,context,false);return current===database&&candidate.userId===scope.userId&&candidate.tribeId===scope.tribeId&&candidate.purpose===scope.purpose&&candidate.connectionId===scope.connectionId&&candidate.connectionVersion===scope.connectionVersion&&candidate.verificationEpoch===policy.verificationEpoch;};}

  /** @param database - Original operation transaction. @param context - Native actor. @param scope - Actual current policy/resource/contact. @param operationId - Original client UUID. @param ledgerId - Already committed claim identity. @param previous - Exact original challenge for explicit replacement only. @returns Minimal public issuance after shared budgets and private outbox commit together. */
  private async issueInside(database:RequestDatabase,context:AdmissionVerificationAccountScope&{admissionRequestId?:string|null},{scope,operationId,ledgerId,previous,personalInvitationId}:{scope:VerificationChallengeScope;operationId:string;ledgerId:string;previous:string|null;personalInvitationId?:string}){
    // A denial rolls back to the savepoint, which releases locks taken inside it: checks inside the section reuse only authority held before it.
    return withAdmissionApplicantSavepointSection(database,async()=>{
    await database.execute(sql.raw(ADMISSION_ISSUANCE_EFFECT_SQL.begin));
    const nativeOwns=this.ownsScope(database,context,scope),owns=async(current:RequestDatabase,candidate:VerificationChallengeScope)=>{if(!await nativeOwns(current,candidate))return false;if(personalInvitationId)await authorizePersonalContactIssuance(current,context,{invitationId:personalInvitationId,contact:scope.contact,security:await this.readSecurityConfig()});else if(context.admissionRequestId)await this.assertPendingIssuance(current,context,context.admissionRequestId,scope.contact);return true;},contacts=new PostgresMessagingContactBudgetRepository(database,(current)=>owns(current,scope),this.readSecurityConfig),budget=new PostgresVerificationRequestBudget(database,(current,command)=>owns(current,command.scope),contacts),result=await new PostgresContactVerificationIssuer(database,owns,this.readSecurityConfig,budget).issue({scope,operationId,ledgerId,expectedCurrentChallengeId:previous,...(personalInvitationId?{personalInvitationId,...(context.admissionRequestId?{personalRequestId:context.admissionRequestId}:{})}:{})});
    if(result.outcome===VERIFICATION_ISSUANCE_OUTCOME.denied){await database.execute(sql.raw(ADMISSION_ISSUANCE_EFFECT_SQL.rollback));await database.execute(sql.raw(ADMISSION_ISSUANCE_EFFECT_SQL.release));return{purpose:ADMISSION_VERIFICATION_PURPOSE.admission,result:VERIFICATION_TRANSITION_OUTCOME.denied,code:result.code};}
    await database.execute(sql.raw(ADMISSION_ISSUANCE_EFFECT_SQL.release));
    const maskedDestination=scope.contact.type===ADMISSION_CONTACT_TYPE.phone?`${ADMISSION_CONTACT_MASK}${scope.contact.value.slice(-ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH)}`:`${Array.from(scope.contact.value)[0]??""}${ADMISSION_CONTACT_MASK}@${scope.contact.value.split("@").at(-1)??""}`;
    // A live code of the same origin (another tab or device) is returned as is: the person enters it or asks for its explicit resend.
    if(result.outcome===VERIFICATION_ISSUANCE_OUTCOME.current)return{challengeId:result.challengeId,deliveryId:result.deliveryId,purpose:ADMISSION_VERIFICATION_PURPOSE.admission,channel:result.channel,maskedDestination,expiresAt:result.expiresAt.toISOString(),resendAllowedAt:result.resendAllowedAt.toISOString(),deliveryState:result.deliveryState,reusedCurrent:true as const};
    return{challengeId:result.challengeId,deliveryId:result.deliveryId,purpose:ADMISSION_VERIFICATION_PURPOSE.admission,channel:scope.channel,maskedDestination,expiresAt:result.expiresAt.toISOString(),resendAllowedAt:result.resendAllowedAt.toISOString(),deliveryState:MESSAGE_DELIVERY_STATE.queued};
    });
  }

  /** @param original - Guarded actual ledger snapshot after commit/read. @returns Only a granted challenge or registered progress. @throws A completed own denial with its original identity, without fabricating a challenge or dispatch. */
  private issuanceResult(original:AdmissionOperationResult<z.infer<typeof admissionIssuanceSnapshotSchema>>){
    if(original.state===OPERATION_STATE.started)return original;
    const snapshot=original.result;
    if("code"in snapshot)throw new AdmissionOperationError(snapshot.code,{operationId:original.operationId,operationState:OPERATION_STATE.completed});
    return{...original,result:snapshot};
  }

  /** @param input - Native confirmed common-policy or personal proposal. @returns Original issuance or registered progress; OFF rejects before a new claim and replay precedes current policy CAS. */
  async issue(input:AdmissionChallengeIssuanceIntent){
    const command={actorUserId:input.userId,tribeId:input.tribeId,operationType:VERIFICATION_ISSUANCE_OPERATION.issue,idempotencyKey:input.operationId,intent:{purpose:ADMISSION_VERIFICATION_PURPOSE.admission,expectedPolicyVersion:input.expectedPolicyVersion,contact:input.contact,channel:input.channel,admissionRequestId:input.admissionRequestId,source:input.source,confirmed:input.confirmed}},ledger=this.ledger(input),original=await ledger.read(command,admissionIssuanceSnapshotSchema);
    if(original?.state===OPERATION_STATE.completed)return this.issuanceResult(original);
    // Nothing is registered yet: a platform that cannot protect the code is a definitive rejection, not an unexpected failure.
    if(!original)await rejectWithoutPlatformSecurity(()=>this.execute(input,(database)=>this.issuanceScope(database,input)));
    return this.issuanceResult(await this.run(ledger,command,admissionIssuanceSnapshotSchema,async(database,ledgerId)=>{
      const prepared=await this.issuanceScope(database,input),result=await this.issueInside(database,input,{scope:prepared.scope,operationId:input.operationId,ledgerId,previous:null,personalInvitationId:prepared.personal?.invitation.id});
      if(prepared.personal&&input.source.kind===ADMISSION_REQUEST_SOURCE.personal)await assertPersonalInvitationTokenCurrent(prepared.personal,input.source.token,await this.readSecurityConfig());
      return result;
    }));
  }

  /**
   * Confirms a local code and records its new proof within the original authorized ledger transaction.
   * @param input - Original own challenge and exact code intent.
   * @returns Local proof with its private creation fact, or committed denial/failure accounting, independently of provider, country or send quota.
   * @throws AdmissionOperationError when current authority or the confirmed own proof is unavailable, preserving rollback.
   */
  async verify(input:AdmissionChallengeVerificationIntent){
    const command={actorUserId:input.userId,tribeId:input.tribeId,operationType:ADMISSION_CONTACT_VERIFICATION_OPERATION,idempotencyKey:input.operationId,intent:{purpose:ADMISSION_VERIFICATION_PURPOSE.admission,challengeId:input.challengeId,verificationCode:input.verificationCode}},ledger=this.ledger(input),original=await ledger.read(command,admissionChallengeVerificationSnapshotSchema);
    if(original?.state===OPERATION_STATE.completed)return original;
    if(!original)await this.execute(input,(database)=>this.challengeScope(database,input,input.challengeId));
    return this.run(ledger,command,admissionChallengeVerificationSnapshotSchema,async(database,ledgerId)=>{
      const scope=await this.challengeScope(database,input,input.challengeId),owns=this.ownsScope(database,input,scope),result=await new PostgresContactVerificationRepository(database,owns,this.readSecurityConfig,new PostgresVerificationFailureBudget(database)).validate({scope,challengeId:input.challengeId,operationId:ledgerId,code:input.verificationCode});
      if(result.outcome!==VERIFICATION_TRANSITION_OUTCOME.verified){
        let code=result.outcome===VERIFICATION_TRANSITION_OUTCOME.wrongCode?ADMISSION_ERROR_CODE.verificationCodeIncorrect:ADMISSION_CONTACT_VERIFICATION_DENIAL_CODE[result.reason];
        if(result.outcome===VERIFICATION_TRANSITION_OUTCOME.denied&&result.reason===VERIFICATION_CHALLENGE_REASON.unavailable){const stored=(await database.execute<{failed_attempts:number;invalidation_reason:string|null}>(sql`select failed_attempts,invalidation_reason from public.contact_verification_challenges where id=${input.challengeId} and user_id=${input.userId} and tribe_id=${input.tribeId}`)).rows[0];if(stored?.invalidation_reason===VERIFICATION_CHALLENGE_REASON.attemptsExhausted&&stored.failed_attempts>=ADMISSION_LIMIT.verificationChallengeFailureCount)code=ADMISSION_ERROR_CODE.verificationAttemptsExceeded;}
        return{purpose:ADMISSION_VERIFICATION_PURPOSE.admission,result:VERIFICATION_TRANSITION_OUTCOME.denied,code};
      }
      if(!result.proofId||result.purpose!==ADMISSION_VERIFICATION_PURPOSE.admission)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.proofUnavailable);
      const proof=(await database.execute<{challenge_id:string;status:AdmissionVerificationProof["status"];verification_epoch:number;verified_at:Date|string;apply_before:Date|string}>(sql`select challenge_id,status,verification_epoch,verified_at,apply_before from public.academy_admission_verification_proofs where id=${result.proofId} and user_id=${input.userId} and tribe_id=${input.tribeId}`)).rows[0];if(!proof)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.proofUnavailable);
      await new PostgresAdmissionAuditRepository(database).append(createAdmissionResourceAuditEvent({resourceType:ADMISSION_AUDIT_RESOURCE_TYPE.proof,eventType:ADMISSION_PROOF_CREATION_AUDIT_EVENT,tribeId:input.tribeId,actorUserId:input.userId,operationId:ledgerId,resourceId:result.proofId,resourceVersion:null,rule:null,cause:null,createdAt:new Date(proof.verified_at),metadata:{fromState:null,toState:proof.status,challengeId:proof.challenge_id,requestId:null,verificationEpoch:proof.verification_epoch,channel:scope.channel}}));
      return{purpose:ADMISSION_VERIFICATION_PURPOSE.admission,result:VERIFICATION_TRANSITION_OUTCOME.verified,proofId:result.proofId,applyBefore:new Date(proof.apply_before).toISOString()};
    });
  }

  /** @param input - Original own challenge and explicit permitted alternative. @returns Confirmed replay or new committed issuance; a new operation checks challenge ownership before claiming progress. */
  async resend(input:AdmissionChallengeResendIntent){
    const command={actorUserId:input.userId,tribeId:input.tribeId,operationType:VERIFICATION_ISSUANCE_OPERATION.resend,idempotencyKey:input.operationId,intent:{purpose:ADMISSION_VERIFICATION_PURPOSE.admission,challengeId:input.challengeId,useSmsAlternative:input.useSmsAlternative??false}},ledger=this.ledger(input),original=await ledger.read(command,admissionIssuanceSnapshotSchema);
    if(original?.state===OPERATION_STATE.completed)return this.issuanceResult(original);
    if(!original)await this.execute(input,(database)=>this.challengeScope(database,input,input.challengeId));
    return this.issuanceResult(await this.run(ledger,command,admissionIssuanceSnapshotSchema,async(database,ledgerId)=>{
      const scope=await this.challengeScope(database,input,input.challengeId),policy=await this.policy(database,input,true);
      const origin=(await database.execute<{personal_invitation_id:string|null;personal_request_id:string|null}>(sql`select to_jsonb(challenge)->>'personal_invitation_id' as personal_invitation_id,to_jsonb(challenge)->>'personal_request_id' as personal_request_id from public.contact_verification_challenges challenge where id=${input.challengeId} and user_id=${input.userId} and tribe_id=${input.tribeId}`)).rows[0];
      const issuanceContext={...input,...(origin?.personal_request_id?{admissionRequestId:origin.personal_request_id}:{})};
      if(origin?.personal_invitation_id)await authorizePersonalContactIssuance(database,issuanceContext,{invitationId:origin.personal_invitation_id,contact:scope.contact,security:await this.readSecurityConfig()});
      if(input.useSmsAlternative){if(scope.contact.type!==ADMISSION_CONTACT_TYPE.phone||scope.channel!==MESSAGING_PUBLIC_CHANNEL.whatsapp||!policy.allowSmsAlternative)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);scope.channel=MESSAGING_PUBLIC_CHANNEL.sms;}
      return this.issueInside(database,issuanceContext,{scope,operationId:input.operationId,ledgerId,previous:input.challengeId,personalInvitationId:origin?.personal_invitation_id??undefined});
    }));
  }

  /** @param database - Original authorized transaction. @param input - Native identity and opaque own proof reference. @returns Immutable contact/resource scope from the proof origin, never from caller contact or connection fields. */
  private async proofScope(database:RequestDatabase,input:AdmissionProofApplicationIntent):Promise<VerificationChallengeScope>{
    await this.authorize(database,input);
    const origin=(await database.execute<{challenge_id:string}>(sql`select challenge_id from public.academy_admission_verification_proofs where id=${input.proofId} and user_id=${input.userId} and tribe_id=${input.tribeId}`)).rows[0];
    if(!origin)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.proofUnavailable);
    return this.challengeScope(database,input,origin.challenge_id);
  }

  /** @param input - Original native own pending request, proof and observed version. @returns Confirmed historical attachment/denial or registered progress, reconciling a lost commit without another binding or proof application. */
  async apply(input:AdmissionProofApplicationIntent){
    const command={actorUserId:input.userId,tribeId:input.tribeId,operationType:ADMISSION_PROOF_OPERATION,idempotencyKey:input.operationId,intent:{purpose:ADMISSION_VERIFICATION_PURPOSE.admission,admissionRequestId:input.admissionRequestId,proofId:input.proofId,expectedRequestVersion:input.expectedRequestVersion}},ledger=this.ledger(input),original=await ledger.read(command,admissionProofApplicationSnapshotSchema);
    if(original?.state===OPERATION_STATE.completed)return original;
    if(!original)await rejectWithoutPlatformSecurity(()=>this.execute(input,(database)=>this.proofScope(database,input)));
    return this.run(ledger,command,admissionProofApplicationSnapshotSchema,async(database,ledgerId)=>{
      const scope=await this.proofScope(database,input),owns=this.ownsScope(database,input,scope);
      return new PostgresAdmissionVerificationProofWriter(database,owns,this.readSecurityConfig).applyToPending({scope,requestId:input.admissionRequestId,proofId:input.proofId,expectedRequestVersion:input.expectedRequestVersion,operationId:input.operationId,ledgerId});
    });
  }
}
