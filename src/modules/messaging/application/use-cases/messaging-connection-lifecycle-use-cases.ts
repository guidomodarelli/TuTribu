/** Orchestrates exact local connection authority before atomic suspension or ordinary retirement. @module messaging-connection-lifecycle-use-cases */
import type { ResolveMessagingTribeManagementUseCase, MessagingConnectionLifecycleQuery } from "./resolve-messaging-tribe-management-use-case";
import type { MessagingConnectionLifecycleActions, MessagingConnectionLifecycleContext, MessagingConnectionLifecycleInput, MessagingConnectionLifecycleOperation, MessagingConnectionSuspensionInput } from "../../domain/repositories/messaging-connection-lifecycle";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MessagingUsageOperationError } from "../../domain/errors/messaging-usage-operation-error";
import { MessagingConnectionOperationError } from "../../domain/errors/messaging-connection-operation-error";
import { messagingFailure } from "../results/messaging-errors";

/** Boundary-normalized own action has no account, role, secret, provider or readiness input. */
export type ManageMessagingConnectionLifecycleInput=MessagingConnectionLifecycleQuery&MessagingConnectionLifecycleInput;
/** Requires explicit security cause without accepting arbitrary diagnostic text. */
export type SuspendMessagingConnectionInput=MessagingConnectionLifecycleQuery&MessagingConnectionSuspensionInput;

/** Owns no SDK or SecretStore and never retries a possibly committed local action. */
export class ManageMessagingConnectionLifecycleUseCases<Result>{
  /** @param management - Actual current native leadership and exact scoped global recency. @param lifecycle - Atomic local writer with repeated authorization, dependency checks and original recovery. */
  constructor(private readonly management:Pick<ResolveMessagingTribeManagementUseCase,"execute">,private readonly lifecycle:MessagingConnectionLifecycleActions<Result>){}
  /** @param input - Original own UUID/CAS and exact resource. @param operation - Server-selected local action. @param perform - Exact DB-only action using current authority. @returns Committed original result or safe failure with proven registered progress only. */
  private async run(input:ManageMessagingConnectionLifecycleInput,operation:MessagingConnectionLifecycleOperation,perform:(context:MessagingConnectionLifecycleContext)=>Promise<AdmissionOperationResult<Result>>){
    try{
      const context=await this.management.execute({tribeId:input.tribeId,connectionId:input.connectionId,requestId:input.requestId},operation);
      return{ok:true as const,value:await perform(context)};
    }catch(error){
      const known=error instanceof MessagingUsageOperationError||error instanceof MessagingConnectionOperationError;
      const registered=error instanceof MessagingConnectionOperationError&&error.operationId===input.operationId;
      const proposed=known?error.code:MESSAGING_ERROR_CODE.unexpectedFailure;
      const code=proposed===MESSAGING_ERROR_CODE.operationUnresolved&&!registered?MESSAGING_ERROR_CODE.unexpectedFailure:proposed;
      return{ok:false as const,failure:messagingFailure(code,{cause:error,...(registered&&code===MESSAGING_ERROR_CODE.operationUnresolved?{operation:{operationId:input.operationId,state:OPERATION_STATE.started}}:{})})};
    }
  }
  /** @param input - Explicit security reason and original own operation/CAS. @returns Local stop metadata or current safe failure, without provider availability or external revocation. */
  suspend(input:SuspendMessagingConnectionInput){return this.run(input,REAUTHENTICATION_OPERATION.suspendMessagingConnection,(context)=>this.lifecycle.suspend(context,input));}
  /** @param input - Explicit original own operation/CAS. @returns Ordinary retirement metadata only after the writer confirms current dependencies. */
  disconnect(input:ManageMessagingConnectionLifecycleInput){return this.run(input,REAUTHENTICATION_OPERATION.disconnectMessagingConnection,(context)=>this.lifecycle.disconnect(context,input));}
}
