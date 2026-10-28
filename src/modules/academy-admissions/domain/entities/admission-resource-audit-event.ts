/** Constructs closed private audit facts for the complete admission and messaging resource vocabulary. @module admission-resource-audit-event */
import type {MessagingErrorCode} from "@/src/modules/messaging/domain/errors/messaging-error-code";
import {ADMISSION_AUDIT_RESOURCE_TYPE} from "../../constants/admission-audit";
import {ADMISSION_ERROR_CODE,type AdmissionErrorCode} from "../../constants/admission-errors";
import {AdmissionOperationError} from "../errors/admission-operation-error";
import {ADMISSION_RETRY_AUDIT} from "../../constants/admission-decision";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {NOTIFICATION_DELIVERY_RECOVERY_AUDIT} from "@/src/modules/messaging/constants/notification-delivery-recovery";

/** Restricts receipt and worker causes to owned protocol outcomes, never raw provider reasons. */
export type AdmissionDeliveryAuditCause="provider_accepted"|"provider_delivered"|"provider_rejected"|"dispatch_result_unknown"|"worker_lease_expired"|"delivery_expired"|"security_context_changed"|"connection_unavailable"|"leadership_changed"|"credentials_unprepared"|"test_mode_connection"|"challenge_unavailable"|"capability_unprepared"|"diagnostic_unavailable"|"quota_exceeded";

/** Keeps actor and ledger references private; background events never fabricate a user or original command. */
export type AdmissionResourceAuditScope={tribeId:string;actorUserId:string|null;operationId:string|null;resourceId:string;resourceVersion:number|null;rule:string|null;cause:AdmissionErrorCode|MessagingErrorCode|AdmissionDeliveryAuditCause|"authorized_connection_replacement"|"connection_replaced"|"messaging_connection_replaced"|"connection_disconnected"|"suspected_compromise"|"security_stop"|"ordinary_retirement"|"scheduled_expiration"|"scope_retired"|"policy_verification_context_changed"|"explicit_resend"|"candidate_expired"|null;createdAt:Date};
/** Declares resource names independently of runtime constants. */
export type AdmissionResourceAuditKind="admission_request"|"allowlist_entry"|"personal_invitation"|"messaging_usage_policy"|"messaging_connection"|"authorized_exposure"|"message_delivery"|"admission_notification"|"admission_email_settings"|"messaging_protection"|"admission_proof"|"membership"|"retention_run";
/** Limits ordinary request changes to owner-derived states, effective policy and opaque evidence. */
export type AdmissionRequestAuditEventType="pending_created"|"approved"|"rejected"|"cancelled"|"expired";
/** Keeps applicant content and ordinary decision reasons with their owners. */
type RequestAuditMetadata={fromStatus:"pending"|"approved"|"rejected"|"cancelled"|"expired"|null;toStatus:"pending"|"approved"|"rejected"|"cancelled"|"expired";previousVersion:number|null;policyVersion:number;verificationEpoch:number;proofId:string|null;decisionId:string|null;invitationId:string|null};
/** Records ordinary lifecycle without copying an arbitrary internal reason. */
type RequestAuditDetails={resourceType:"admission_request";eventType:AdmissionRequestAuditEventType;metadata:RequestAuditMetadata};
/** Records a declared-field correction without its former or current value. */
type WhatsappNumberAuditDetails={resourceType:"admission_request";eventType:"whatsapp_number_changed";metadata:RequestAuditMetadata};
/** Preserves the existing private corrective reason only for its dedicated retry fact, not general request messages. */
type RetryAuditDetails={resourceType:"admission_request";eventType:"retry_allowed";metadata:RequestAuditMetadata&{internalReason:string;previousRetryAllowedAt:string|null;retryAllowedAt:string}};
/** Stores list configuration lineage without descriptive names or contact identity. */
type AllowlistAuditDetails={resourceType:"allowlist_entry";eventType:"create_allowlist_entry"|"update_allowlist_entry"|"confirm_allowlist_import";metadata:{fromStatus:"enabled"|"disabled"|null;toStatus:"enabled"|"disabled";previousVersion:number|null;importId:string|null;contactType:"email"|"phone"}};
/** Preserves single-use lifecycle and the scoped presentation supported by redemption. */
export type PersonalInvitationAuditEventType="create_personal_invitation"|"rename_personal_invitation"|"revoke_personal_invitation"|"personal_invitation_redeemed"|"expired";
/** Keeps authorization withdrawal separate from the immutable consumed status. */
type InvitationAuditDetails={resourceType:"personal_invitation";eventType:PersonalInvitationAuditEventType;metadata:{fromStatus:"active"|"revoked"|"expired"|"redeemed"|null;toStatus:"active"|"revoked"|"expired"|"redeemed";previousVersion:number|null;requestId:string|null;fromAuthorizationRevoked:boolean|null;toAuthorizationRevoked:boolean}};
/** Captures effective quota/country configuration, never mutable counters or subject labels. */
export type AdmissionUsageAuditEventType="initialize_messaging_usage"|"update_messaging_usage";
/** Snapshots configuration independently of mutable consumption. */
type UsageAuditDetails={resourceType:"messaging_usage_policy";eventType:AdmissionUsageAuditEventType;metadata:{previousVersion:number|null;allowedCountries:readonly string[];verificationDailyLimit:number;notificationDailyLimit:number}};
/** Distinguishes lifecycle CAS from configuration versions and excludes every operational secret/provider object. */
export type AdmissionConnectionAuditEventType="save_messaging_credentials"|"validate_messaging_connection"|"configure_messaging_connection"|"activate_messaging_connection"|"suspend_messaging_connection"|"disconnect_messaging_connection"|"messaging_connection_compromised"|"messaging_connection_retired";
/** Captures lifecycle/configuration lineage without operational secrets. */
type ConnectionAuditMetadata={fromState:"draft"|"ready"|"active"|"degraded"|"suspended"|"disconnected"|null;toState:"draft"|"ready"|"active"|"degraded"|"suspended"|"disconnected";previousVersion:number|null;configurationVersion:number|null;previousConfigurationVersion:number|null;channel:"email"|"sms"|"whatsapp"|null};
/** Keeps validation outcomes explicit without accepting provider account/key identifiers. */
type ConnectionAuditDetails={resourceType:"messaging_connection";eventType:Exclude<AdmissionConnectionAuditEventType,"validate_messaging_connection">;metadata:ConnectionAuditMetadata}|{resourceType:"messaging_connection";eventType:"validate_messaging_connection";metadata:ConnectionAuditMetadata&{previousCredentialState:"not_validated"|"valid"|"invalid"|"unavailable";credentialState:"not_validated"|"valid"|"invalid"|"unavailable";credentialMode:"unknown"|"test"|"production"}};
/** Records an authorized read's surface and extent without persisting the exposed content. */
type ExposureAuditDetails={resourceType:"authorized_exposure";eventType:"authorized_resource_exposure";metadata:{surface:"activity"|"metrics"|"allowlist"|"allowlist_report"|"invitations"|"request_details"|"connection_resources"|"operational_secret";itemCount:number;resourceKind:"senders"|"templates"|"entries"|"requests"|"invitations"|"aggregate"|"credential"}};
/** Declares persisted delivery states without deriving a type from runtime constants. */
type DeliveryAuditState="queued"|"accepted"|"delivered"|"failed"|"unknown"|"suppressed"|"cancelled";
/** Carries transport lineage, actual attempt and effective policy without a recipient, payload or lease token. */
type DeliveryAuditMetadata={fromState:DeliveryAuditState|null;toState:DeliveryAuditState;previousVersion:number|null;connectionId:string;connectionVersion:number;channel:"email"|"sms"|"whatsapp";attemptId:string|null;authorizedUsagePolicyVersion:number|null;originalDeliveryId?:string;targetConnectionId?:string};
/** Keeps the original disposition/version separate from the new queued child's lifecycle. */
type NotificationRecoveryAuditMetadata=DeliveryAuditMetadata&{originalDeliveryId:string;targetConnectionId:string;originalConnectionId:string;originalConnectionVersion:number;originalFromState:DeliveryAuditState;originalToState:DeliveryAuditState;previousOriginalVersion:number;originalVersion:number;originalAttemptId:string|null;originalAuthorizedUsagePolicyVersion:number|null};
/** Restricts recovery provenance to its dedicated event rather than general worker transitions. */
type DeliveryAuditDetails={resourceType:"message_delivery";eventType:"delivery_created"|"delivery_attempt_started"|"delivery_accepted"|"delivery_delivered"|"delivery_failed"|"delivery_unknown"|"delivery_suppressed"|"delivery_deferred"|"delivery_cancelled"|"delivery_reconciled";metadata:DeliveryAuditMetadata}|{resourceType:"message_delivery";eventType:"notification_delivery_recovered";metadata:NotificationRecoveryAuditMetadata};
/** Stores purpose-separated rotation provenance without key material, MACs or envelopes. */
type ProtectionAuditDetails={resourceType:"messaging_protection";eventType:"protection_keys_rotated"|"secret_retired"|"secret_purged"|"recovery_locked";metadata:{purpose:"credential"|"otp_envelope"|"verification_mac"|"invitation_token"|"contact_fingerprint"|"operation_payload";previousKeyId:string|null;activeKeyId:string|null;securityEpoch:string}};
/** Links local verification to its exact challenge/request, independently of transport receipts. */
type ProofAuditDetails={resourceType:"admission_proof";eventType:"proof_created"|"proof_applied"|"proof_invalidated"|"proof_expired";metadata:{fromState:"available"|"applied"|"invalid"|"expired"|null;toState:"available"|"applied"|"invalid"|"expired";challengeId:string;requestId:string|null;verificationEpoch:number;channel:"email"|"sms"|"whatsapp"}};
/** Distinguishes membership instance changes from role changes without reconstructing commercial rights from a flag. */
type MembershipAuditDetails={resourceType:"membership";eventType:"membership_admitted"|"membership_revoked"|"membership_role_changed";metadata:{membershipInstanceId:string;fromRole:"leader"|"guardian"|"tribemate"|null;toRole:"leader"|"guardian"|"tribemate"|null;fromStatus:"active"|"muted"|"blocked"|"removed"|null;toStatus:"active"|"muted"|"blocked"|"removed"|null;requestId:string|null;decisionId:string|null}};
/** Keeps bounded maintenance results and an optional observed batch phase; legacy facts never acquire a fabricated duration. */
type RetentionAuditDetails={resourceType:"retention_run";eventType:"retention_completed";metadata:{owner:"admission_requests"|"admission_audit"|"allowlist_import_material"|"messaging_secrets"|"verification_material"|"messaging_candidates";processed:number;remaining:boolean;cutoff:string;durationMs?:number}};
/** Keeps original obligation lineage and observed extent without the notice's recipient or content. */
type NotificationAuditDetails={resourceType:"admission_notification";eventType:"notification_obligation_created"|"notification_materialized";metadata:{obligationId:string;requestId:string;requestVersion:number;sourceEvent:"pending_created"|"approved"|"rejected"|"cancelled"|"expired"|"reminder";audience:"applicant"|"reviewer"|null;durationMs:number|null}};
/** Keeps the independent email epoch reconstructible without addresses, credentials or OTP policy. */
type EmailSettingsAuditDetails={resourceType:"admission_email_settings";eventType:"admission_email_settings_changed";metadata:{previousVersion:number|null;enabled:boolean;timeZone:string}};
/** The input is already an owner's business fact; its extra properties must never be copied into storage. */
export type AdmissionResourceAuditInput=AdmissionResourceAuditScope&(RequestAuditDetails|WhatsappNumberAuditDetails|RetryAuditDetails|AllowlistAuditDetails|InvitationAuditDetails|UsageAuditDetails|ConnectionAuditDetails|ExposureAuditDetails|DeliveryAuditDetails|NotificationAuditDetails|EmailSettingsAuditDetails|ProtectionAuditDetails|ProofAuditDetails|MembershipAuditDetails|RetentionAuditDetails);
/** Uses the same closed vocabulary after selecting and snapshotting only its allowed fields. */
export type AdmissionResourceAuditEvent=AdmissionResourceAuditInput;

/**
 * Selects reconstructible owner facts without spreading commands, provider payloads or exception labels.
 * @param input - Current private actor/resource/operation/version and authoritative clock; additional properties a
 *   caller's object carries are discarded.
 * @returns A detached event whose metadata is selected by its fixed resource kind.
 * @throws AdmissionOperationError when the internal resource kind is unsupported.
 */
export function createAdmissionResourceAuditEvent(input:AdmissionResourceAuditInput):AdmissionResourceAuditEvent{
  const current=input;
  const scope={tribeId:current.tribeId,actorUserId:current.actorUserId,operationId:current.operationId,resourceId:current.resourceId,resourceVersion:current.resourceVersion,rule:current.rule,cause:current.cause,createdAt:new Date(current.createdAt)};
  switch(current.resourceType){
    case ADMISSION_AUDIT_RESOURCE_TYPE.request:{
      const metadata=current.metadata;
      const requestMetadata={fromStatus:metadata.fromStatus,toStatus:metadata.toStatus,previousVersion:metadata.previousVersion,policyVersion:metadata.policyVersion,verificationEpoch:metadata.verificationEpoch,proofId:metadata.proofId,decisionId:metadata.decisionId,invitationId:metadata.invitationId};
      if(current.eventType===ADMISSION_RETRY_AUDIT.event)return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{...requestMetadata,internalReason:current.metadata.internalReason,previousRetryAllowedAt:current.metadata.previousRetryAllowedAt,retryAllowedAt:current.metadata.retryAllowedAt}};
      return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:requestMetadata};
    }
    case ADMISSION_AUDIT_RESOURCE_TYPE.allowlistEntry:{const metadata=current.metadata;return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{fromStatus:metadata.fromStatus,toStatus:metadata.toStatus,previousVersion:metadata.previousVersion,importId:metadata.importId,contactType:metadata.contactType}};}
    case ADMISSION_AUDIT_RESOURCE_TYPE.personalInvitation:{const metadata=current.metadata;return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{fromStatus:metadata.fromStatus,toStatus:metadata.toStatus,previousVersion:metadata.previousVersion,requestId:metadata.requestId,fromAuthorizationRevoked:metadata.fromAuthorizationRevoked,toAuthorizationRevoked:metadata.toAuthorizationRevoked}};}
    case ADMISSION_AUDIT_RESOURCE_TYPE.usagePolicy:{const metadata=current.metadata;return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{previousVersion:metadata.previousVersion,allowedCountries:[...metadata.allowedCountries],verificationDailyLimit:metadata.verificationDailyLimit,notificationDailyLimit:metadata.notificationDailyLimit}};}
    case ADMISSION_AUDIT_RESOURCE_TYPE.connection:{
      const metadata=current.metadata;
      const connectionMetadata={fromState:metadata.fromState,toState:metadata.toState,previousVersion:metadata.previousVersion,configurationVersion:metadata.configurationVersion,previousConfigurationVersion:metadata.previousConfigurationVersion,channel:metadata.channel};
      if(current.eventType===REAUTHENTICATION_OPERATION.validateMessagingConnection)return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{...connectionMetadata,previousCredentialState:current.metadata.previousCredentialState,credentialState:current.metadata.credentialState,credentialMode:current.metadata.credentialMode}};
      return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:connectionMetadata};
    }
    case ADMISSION_AUDIT_RESOURCE_TYPE.exposure:{const metadata=current.metadata;return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{surface:metadata.surface,itemCount:metadata.itemCount,resourceKind:metadata.resourceKind}};}
    case ADMISSION_AUDIT_RESOURCE_TYPE.notification:{const metadata=current.metadata;return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{obligationId:metadata.obligationId,requestId:metadata.requestId,requestVersion:metadata.requestVersion,sourceEvent:metadata.sourceEvent,audience:metadata.audience,durationMs:metadata.durationMs}};}
    case ADMISSION_AUDIT_RESOURCE_TYPE.emailSettings:{const metadata=current.metadata;return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{previousVersion:metadata.previousVersion,enabled:metadata.enabled,timeZone:metadata.timeZone}};}
    case ADMISSION_AUDIT_RESOURCE_TYPE.delivery:{
      const metadata=current.metadata;
      const deliveryMetadata={fromState:metadata.fromState,toState:metadata.toState,previousVersion:metadata.previousVersion,connectionId:metadata.connectionId,connectionVersion:metadata.connectionVersion,channel:metadata.channel,attemptId:metadata.attemptId,authorizedUsagePolicyVersion:metadata.authorizedUsagePolicyVersion,...(metadata.originalDeliveryId!==undefined?{originalDeliveryId:metadata.originalDeliveryId}:{}),...(metadata.targetConnectionId!==undefined?{targetConnectionId:metadata.targetConnectionId}:{})};
      if(current.eventType===NOTIFICATION_DELIVERY_RECOVERY_AUDIT.eventType)return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{...deliveryMetadata,originalDeliveryId:current.metadata.originalDeliveryId,targetConnectionId:current.metadata.targetConnectionId,originalConnectionId:current.metadata.originalConnectionId,originalConnectionVersion:current.metadata.originalConnectionVersion,originalFromState:current.metadata.originalFromState,originalToState:current.metadata.originalToState,previousOriginalVersion:current.metadata.previousOriginalVersion,originalVersion:current.metadata.originalVersion,originalAttemptId:current.metadata.originalAttemptId,originalAuthorizedUsagePolicyVersion:current.metadata.originalAuthorizedUsagePolicyVersion}};
      return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:deliveryMetadata};
    }
    case ADMISSION_AUDIT_RESOURCE_TYPE.protection:{const metadata=current.metadata;return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{purpose:metadata.purpose,previousKeyId:metadata.previousKeyId,activeKeyId:metadata.activeKeyId,securityEpoch:metadata.securityEpoch}};}
    case ADMISSION_AUDIT_RESOURCE_TYPE.proof:{const metadata=current.metadata;return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{fromState:metadata.fromState,toState:metadata.toState,challengeId:metadata.challengeId,requestId:metadata.requestId,verificationEpoch:metadata.verificationEpoch,channel:metadata.channel}};}
    case ADMISSION_AUDIT_RESOURCE_TYPE.membership:{const metadata=current.metadata;return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{membershipInstanceId:metadata.membershipInstanceId,fromRole:metadata.fromRole,toRole:metadata.toRole,fromStatus:metadata.fromStatus,toStatus:metadata.toStatus,requestId:metadata.requestId,decisionId:metadata.decisionId}};}
    case ADMISSION_AUDIT_RESOURCE_TYPE.retention:{const metadata=current.metadata;return{...scope,resourceType:current.resourceType,eventType:current.eventType,metadata:{owner:metadata.owner,processed:metadata.processed,remaining:metadata.remaining,cutoff:metadata.cutoff,...(metadata.durationMs!==undefined?{durationMs:metadata.durationMs}:{})}};}
    // `switch-exhaustiveness-check` keeps every resource kind handled; an unusable internal kind fails without reflecting its content.
    default:throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  }
}
