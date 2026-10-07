/** Validates one explicit credential with durable accounting and provider access outside database stages. @module validate-messaging-connection */
import type { ResolveMessagingContextUseCase } from "./resolve-messaging-context-use-case";
import type { MessagingSecretStore,AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingCredentialValidationOperations,MessagingCredentialInspectorFactory,MessagingCredentialValidationInput,MessagingCredentialValidationOutcome } from "@/src/modules/messaging/domain/repositories/messaging-credential-validation";
import type { ReserveMessagingUsageUseCase } from "./reserve-messaging-usage-use-case";
import { MessagingConnectionInspectionError } from "@/src/modules/messaging/domain/errors/messaging-connection-inspection-error";
import { MessagingConnectionOperationError } from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MessagingUsageBudgetError } from "@/src/modules/messaging/domain/errors/messaging-usage-budget-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { messagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";

/** Incoming IDs are resolved again; none are a private permission token. */
export type ValidateMessagingConnectionInput=MessagingCredentialValidationInput&{tribeId:string;connectionId:string;requestId:string};

/** @param original - Original resolved principal and resource. @param current - Facts after key loading. @returns Whether one unchanged authorized scope still owns the attempted inspection. */
function sameValidationScope(original:AuthorizedMessagingContext,current:AuthorizedMessagingContext):boolean{
  return original.tribeId===current.tribeId&&original.resourceId===current.resourceId&&original.connectionId===current.connectionId&&original.connectionVersion===current.connectionVersion&&original.secretRef===current.secretRef&&original.environment===current.environment&&original.securityEpoch===current.securityEpoch;
}

/** Never retries the provider after a consumed reservation, uncertain result or original replay. */
export class ValidateMessagingConnectionUseCase {
  /** @param resolver - Current own account/role/recency/resource authority. @param operations - Committing DB-only preparation/result stages. @param budget - Committing private validation allowance. @param secrets - Current authority-checking private material store. @param inspectors - Explicit per-resource provider factory. */
  constructor(private readonly resolver:Pick<ResolveMessagingContextUseCase,"execute">,private readonly operations:MessagingCredentialValidationOperations,private readonly budget:Pick<ReserveMessagingUsageUseCase,"execute">,private readonly secrets:MessagingSecretStore,private readonly inspectors:MessagingCredentialInspectorFactory){}
  /** @param input - Own boundary-validated original action. @param signal - Caller cancellation/deadline. @returns Original safe metadata, durable progress or a closed current denial. */
  async execute(input:ValidateMessagingConnectionInput,signal:AbortSignal){
    let prepared=false;
    try{
      signal.throwIfAborted();
      const command={tribeId:input.tribeId,connectionId:input.connectionId,requestId:input.requestId,operation:REAUTHENTICATION_OPERATION.validateMessagingConnection};
      const authorization=await this.resolver.execute(command);if(!authorization.allowed)return{ok:false as const,failure:authorization.failure};
      const context=authorization.context,preparation=await this.operations.prepare(context,input);
      if(preparation.state!=="prepared")return{ok:true as const,value:preparation};
      prepared=true;
      if(preparation.configurationVersion!==context.connectionVersion)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.connectionConflict);
      signal.throwIfAborted();
      const reservation=await this.budget.execute({context,operationId:preparation.validationId});
      if(reservation.outcome==="denied")return{ok:false as const,failure:messagingFailure(reservation.code)};
      if(reservation.outcome==="already_reserved")return{ok:true as const,value:await this.operations.read(context,input)??{state:OPERATION_STATE.started,operationId:input.operationId}};
      signal.throwIfAborted();
      const credential=await this.secrets.loadAuthorizedSecret(context);
      const current=await this.resolver.execute(command);if(!current.allowed)return{ok:false as const,failure:current.failure};
      if(context.actorUserId!==current.context.actorUserId||context.sessionId!==current.context.sessionId||context.accountId!==current.context.accountId||context.subject!==current.context.subject)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      if(!sameValidationScope(context,current.context))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.connectionConflict);
      signal.throwIfAborted();
      let outcome:MessagingCredentialValidationOutcome;
      try{outcome={ok:true,inspection:await this.inspectors.create(context,credential).inspectCredential(signal)};}
      catch(error){if(signal.aborted)throw error;if(!(error instanceof MessagingConnectionInspectionError))throw error;outcome={ok:false,code:error.code};}
      signal.throwIfAborted();
      return{ok:true as const,value:await this.operations.complete(context,input,preparation.validationId,outcome)};
    }catch(error){
      const known=error instanceof MessagingConnectionOperationError||error instanceof MessagingSecretAccessError||error instanceof MessagingUsageBudgetError;
      const registered=prepared||error instanceof MessagingConnectionOperationError&&error.operationId===input.operationId;
      const proposedCode=known?error.code:prepared?MESSAGING_ERROR_CODE.operationUnresolved:MESSAGING_ERROR_CODE.unexpectedFailure;
      const code=proposedCode===MESSAGING_ERROR_CODE.operationUnresolved&&!registered?MESSAGING_ERROR_CODE.unexpectedFailure:proposedCode;
      return{ok:false as const,failure:messagingFailure(code,{cause:error,...(code===MESSAGING_ERROR_CODE.operationUnresolved&&registered?{operation:{state:OPERATION_STATE.started,operationId:input.operationId}}:{})})};
    }
  }
}
