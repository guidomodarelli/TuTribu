/** Defines local lifecycle authority independently of operational credentials or provider availability. @module messaging-connection-lifecycle */
import type { MessagingUsageContext } from "./messaging-usage-operations";
import type { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { MESSAGING_CONNECTION_SECURITY_REASON } from "../../constants/messaging-connection-security";

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
