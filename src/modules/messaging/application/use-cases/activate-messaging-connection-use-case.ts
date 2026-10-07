/** Resolves current exact sensitive activation authority before the atomic selection owner. @module activate-messaging-connection */
import type {ResolveMessagingContextUseCase} from "./resolve-messaging-context-use-case";
import type {MessagingConnectionActivator,MessagingConnectionActivationInput} from "@/src/modules/messaging/domain/repositories/messaging-connection-activation";
import {MessagingConnectionOperationError} from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {messagingFailure} from "../results/messaging-errors";

/** Boundary-normalized resource identifiers are resolved again rather than treated as permission. */
export type ActivateMessagingConnectionInput=MessagingConnectionActivationInput&{tribeId:string;connectionId:string;requestId:string};
/** No SecretStore or provider capability is present; activation consumes current local evidence. */
export class ActivateMessagingConnectionUseCase{
  /** @param resolver - Actual current native account/leader/recency/resource authority. @param activator - Atomic metadata/evidence/dependency writer with its own repeated authorization. */
  constructor(private readonly resolver:Pick<ResolveMessagingContextUseCase,"execute">,private readonly activator:MessagingConnectionActivator){}
  /** @param input - Original confirmed expected lifecycle and exact server tenant. @returns Original guarded selection commit, genuine progress or current safe denial. */
  async execute(input:ActivateMessagingConnectionInput){
    try{
      const resolved=await this.resolver.execute({tribeId:input.tribeId,connectionId:input.connectionId,requestId:input.requestId,operation:REAUTHENTICATION_OPERATION.activateMessagingConnection});
      if(!resolved.allowed)return{ok:false as const,failure:resolved.failure};
      return{ok:true as const,value:await this.activator.activate(resolved.context,input)};
    }catch(error){const code=error instanceof MessagingConnectionOperationError||error instanceof MessagingSecretAccessError?error.code:MESSAGING_ERROR_CODE.unexpectedFailure;return{ok:false as const,failure:messagingFailure(code,{cause:error,...(error instanceof MessagingConnectionOperationError&&error.code===MESSAGING_ERROR_CODE.operationUnresolved&&error.operationId?{operation:{operationId:error.operationId,state:OPERATION_STATE.started}}:{})})};}
  }
}
