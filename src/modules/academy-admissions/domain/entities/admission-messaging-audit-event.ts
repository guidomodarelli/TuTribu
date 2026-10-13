/** Selects messaging configuration provenance independently of credentials, provider labels and mutable consumption. @module admission-messaging-audit-event */
import type { TenantMessagingConnection } from "@/src/modules/messaging/domain/entities/tenant-messaging-connection";
import { ADMISSION_AUDIT_RESOURCE_TYPE } from "../../constants/admission-audit";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { createAdmissionResourceAuditEvent, type AdmissionConnectionAuditEventType, type AdmissionUsageAuditEventType, type AdmissionResourceAuditScope } from "./admission-resource-audit-event";

/** Captures the effective policy values and the original private command/clock. */
export type AdmissionUsageAuditInput={tribeId:string;actorUserId:string;operationId:string;eventType:AdmissionUsageAuditEventType;version:number;previousVersion:number|null;allowedCountries:readonly string[];verificationDailyLimit:number;notificationDailyLimit:number;createdAt:Date};
/** Keeps lifecycle and immutable configuration counters separate without copying an envelope or provider resource. */
export type AdmissionConnectionAuditInput={tribeId:string;actorUserId:string;operationId:string;connectionId:string;version:number;state:TenantMessagingConnection["state"];configurationVersion:number|null;previous:{state:TenantMessagingConnection["state"];version:number;configurationVersion:number|null}|null;channel:"email"|"sms"|"whatsapp"|null;rule:string|null;cause:AdmissionResourceAuditScope["cause"];createdAt:Date}&({eventType:Exclude<AdmissionConnectionAuditEventType,"validate_messaging_connection">}|{eventType:"validate_messaging_connection";previousCredentialState:"not_validated"|"valid"|"invalid"|"unavailable";credentialState:"not_validated"|"valid"|"invalid"|"unavailable";credentialMode:"unknown"|"test"|"production"});

/** @param input - Actual initialized/changed policy under its owner's current locks. @returns A detached configuration fact without counters or recipient labels. */
export function createAdmissionUsageAuditEvent(input:AdmissionUsageAuditInput){
  return createAdmissionResourceAuditEvent({tribeId:input.tribeId,actorUserId:input.actorUserId,operationId:input.operationId,resourceType:ADMISSION_AUDIT_RESOURCE_TYPE.usagePolicy,resourceId:input.tribeId,resourceVersion:input.version,eventType:input.eventType,rule:null,cause:null,createdAt:input.createdAt,metadata:{previousVersion:input.previousVersion,allowedCountries:input.allowedCountries,verificationDailyLimit:input.verificationDailyLimit,notificationDailyLimit:input.notificationDailyLimit}});
}

/** @param input - Effective connection change, locked prior state/version and the exact original command clock. @returns A private connection fact without names, sender/provider payloads, keys or ciphertext. */
export function createAdmissionConnectionAuditEvent(input:AdmissionConnectionAuditInput){
  const scope={tribeId:input.tribeId,actorUserId:input.actorUserId,operationId:input.operationId,resourceType:ADMISSION_AUDIT_RESOURCE_TYPE.connection,resourceId:input.connectionId,resourceVersion:input.version,rule:input.rule,cause:input.cause,createdAt:input.createdAt};
  const metadata={fromState:input.previous?.state??null,toState:input.state,previousVersion:input.previous?.version??null,configurationVersion:input.configurationVersion,previousConfigurationVersion:input.previous?.configurationVersion??null,channel:input.channel};
  if(input.eventType===REAUTHENTICATION_OPERATION.validateMessagingConnection)return createAdmissionResourceAuditEvent({...scope,eventType:input.eventType,metadata:{...metadata,previousCredentialState:input.previousCredentialState,credentialState:input.credentialState,credentialMode:input.credentialMode}});
  return createAdmissionResourceAuditEvent({...scope,eventType:input.eventType,metadata});
}
