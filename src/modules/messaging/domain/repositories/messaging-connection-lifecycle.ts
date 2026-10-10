/** Defines local lifecycle authority independently of operational credentials or provider availability. @module messaging-connection-lifecycle */
import type { MessagingUsageContext } from "./messaging-usage-operations";
import type { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { MESSAGING_CONNECTION_SECURITY_REASON } from "../../constants/messaging-connection-security";
import type { MessagingConnectionRetirementFacts } from "../policies/messaging-connection-retirement";

/** Only these connection-scoped local actions can use lifecycle management authority. */
export type MessagingConnectionLifecycleOperation = typeof REAUTHENTICATION_OPERATION.suspendMessagingConnection | typeof REAUTHENTICATION_OPERATION.disconnectMessagingConnection;
/** Contains server-derived identity and exact global recency, with no credential or provider scope. */
export type MessagingConnectionLifecycleContext = MessagingUsageContext & {
  connectionId: string; resourceId: string; operation: MessagingConnectionLifecycleOperation;
  accountId: string; subject: string; authenticatedAt: Date; validUntil: Date;
};
/** An explicit local action keeps the same original operation/CAS and never accepts provider authority or private material. */
export type MessagingConnectionLifecycleInput={operationId:string;expectedVersion:number;confirmed:true};
/** Compromise is an explicit cause that must invalidate affected evidence through its owner. */
export type MessagingConnectionSuspensionInput=MessagingConnectionLifecycleInput&{reason:typeof MESSAGING_CONNECTION_SECURITY_REASON[keyof typeof MESSAGING_CONNECTION_SECURITY_REASON]};
/** The adapter owns atomic effects, dependency checks and the original minimum public snapshot. */
export interface MessagingConnectionLifecycleActions<Result>{
  /** @param context - Current connection-scoped local authority. @param input - Original confirmed suspension/cause/CAS. @returns Committed original metadata or registered progress without external revocation/RPC. */
  suspend(context:MessagingConnectionLifecycleContext,input:MessagingConnectionSuspensionInput):Promise<AdmissionOperationResult<Result>>;
  /** @param context - Current connection-scoped local authority. @param input - Original confirmed ordinary retirement/CAS. @returns Committed original metadata only after current dependencies permit retirement. */
  disconnect(context:MessagingConnectionLifecycleContext,input:MessagingConnectionLifecycleInput):Promise<AdmissionOperationResult<Result>>;
}
/** Feature owners supply current dependency/evidence effects in the same already-authorized transaction. */
export interface MessagingConnectionLifecycleDependencies{
  /** @param context - Current local authority under the writer's exclusive tribe/connection locks. @returns Existing admission/notification settings without initialization or browser claims. */
  readRetirementFacts(context:MessagingConnectionLifecycleContext):Promise<Omit<MessagingConnectionRetirementFacts,"isSelected">>;
  /** @param context - Exact connection whose credential may be compromised. @param ledgerId - Private original operation for audit. @returns After invalidating its unused proofs and affected pending proof evidence while preserving members and invitations. */
  invalidateCompromisedEvidence(context:MessagingConnectionLifecycleContext,ledgerId:string):Promise<void>;
  /** @param context - Exact ordinarily retired resource. @param ledgerId - Private original operation for audit. @returns After detaching only current references allowed by the dependency assessment, preserving applied evidence. */
  retireReferences(context:MessagingConnectionLifecycleContext,ledgerId:string):Promise<void>;
}
