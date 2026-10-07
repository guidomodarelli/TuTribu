/** Starts bounded dispatch for one committed diagnostic using backend marker authority rather than a fictitious human worker session. @module connection-diagnostic-dispatcher */
import "server-only";
import type {ConnectionDiagnosticDispatcher} from "@/src/modules/messaging/domain/repositories/connection-diagnostic-issuance";
import type {AuthorizedMessagingContext,MessagingSecurityFacts} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {DiagnosticDeliveryDispatchScope} from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type {DispatchMessageDeliveriesUseCase} from "@/src/modules/messaging/application/use-cases/dispatch-message-deliveries-use-case";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {MESSAGING_AUTHORIZATION_PURPOSE} from "@/src/modules/messaging/constants/messaging-connection";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";

/** Current protected backend executor and host lifecycle are explicit, never inferred from client claims or provider defaults. */
export type DiagnosticDispatchDependencies={readSecurityFacts:()=>Promise<MessagingSecurityFacts>;createDispatcher:(scope:Readonly<DiagnosticDeliveryDispatchScope>,authorize:()=>Promise<boolean>)=>Pick<DispatchMessageDeliveriesUseCase,"execute">};
/** New work checks current external security; SQL and SecretStore independently verify the exact committed diagnostic/marker/leader. */
export class ScopedConnectionDiagnosticDispatcher implements ConnectionDiagnosticDispatcher{
  /** @param dependencies - Fixed server transport, protected backend executor and retained host lifetime. */
  constructor(private readonly dependencies:DiagnosticDispatchDependencies){}
  /** @param context - Actual private scope from the successful issuance command. @param deliveryId - Exact committed obligation. @returns After bounded original dispatch observation; unresolved transport remains its stored attempt. */
  async dispatch(context:AuthorizedMessagingContext,deliveryId:string):Promise<void>{
    if(context.authorizationPurpose!==MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader||context.operation!==REAUTHENTICATION_OPERATION.diagnoseMessagingConnection||context.resourceId!==context.connectionId)throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
    const{tribeId,actorUserId,connectionId,connectionVersion,environment,securityEpoch}=context;
    const authorize=async()=>{const current=await this.dependencies.readSecurityFacts();return current.recoveryLocked===false&&current.environment===environment&&current.securityEpoch===securityEpoch;};
    await this.dependencies.createDispatcher({deliveryId,tribeId,contributingLeaderUserId:actorUserId,connectionId,connectionVersion},authorize).execute();
  }
}
