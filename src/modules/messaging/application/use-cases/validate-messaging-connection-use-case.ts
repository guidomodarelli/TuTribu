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
import {MESSAGING_CREDENTIAL_RECOVERY_GRACE_MS} from "@/src/modules/messaging/constants/messaging-credential-validation";

/** Incoming IDs are resolved again; none are a private permission token. */
export type ValidateMessagingConnectionInput=MessagingCredentialValidationInput&{tribeId:string;connectionId:string;requestId:string};

/** @param original - Original resolved principal and resource. @param current - Facts after key loading. @returns Whether one unchanged authorized scope still owns the attempted inspection. */
function sameValidationScope(original:AuthorizedMessagingContext,current:AuthorizedMessagingContext):boolean{
  return original.tribeId===current.tribeId&&original.resourceId===current.resourceId&&original.connectionId===current.connectionId&&original.connectionVersion===current.connectionVersion&&original.secretRef===current.secretRef&&original.environment===current.environment&&original.securityEpoch===current.securityEpoch;
}

/** Collaborators of one credential validation; `clock` defaults to the server clock. */
export type ValidateMessagingConnectionUseCaseDependencies={resolver:Pick<ResolveMessagingContextUseCase,"execute">;operations:MessagingCredentialValidationOperations;budget:Pick<ReserveMessagingUsageUseCase,"execute">;secrets:MessagingSecretStore;inspectors:MessagingCredentialInspectorFactory;clock?:()=>Date};

/** Never retries the provider after a consumed reservation, uncertain result or original replay. */
export class ValidateMessagingConnectionUseCase {
  private readonly resolver:Pick<ResolveMessagingContextUseCase,"execute">;
  private readonly operations:MessagingCredentialValidationOperations;
  private readonly budget:Pick<ReserveMessagingUsageUseCase,"execute">;
  private readonly secrets:MessagingSecretStore;
  private readonly inspectors:MessagingCredentialInspectorFactory;
  private readonly clock:()=>Date;
  /** @param dependencies - resolver: current own account/role/resource authority; operations: committing DB-only preparation/result stages; budget: committing private validation allowance; secrets: current authority-checking private material store; inspectors: explicit per-resource provider factory; clock: server time. */
  constructor({resolver,operations,budget,secrets,inspectors,clock=()=>new Date()}:ValidateMessagingConnectionUseCaseDependencies){
    this.resolver=resolver;this.operations=operations;this.budget=budget;this.secrets=secrets;this.inspectors=inspectors;this.clock=clock;
  }
  /** @param input - Own boundary-validated original action. @param signal - Caller cancellation/deadline. @returns Original safe metadata, durable progress or a closed current denial. */
  async execute(input:ValidateMessagingConnectionInput,signal:AbortSignal){
    let prepared=false;
    try{
      signal.throwIfAborted();
      const command={tribeId:input.tribeId,connectionId:input.connectionId,requestId:input.requestId,operationId:input.operationId,operation:REAUTHENTICATION_OPERATION.validateMessagingConnection};
      const authorization=await this.resolver.execute(command);if(!authorization.allowed)return{ok:false as const,failure:authorization.failure};
      const context=authorization.context,preparation=await this.operations.prepare(context,input);
      if(preparation.state!=="prepared")return{ok:true as const,value:preparation};
      prepared=true;
      if(preparation.configurationVersion!==context.connectionVersion)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.connectionConflict);
      signal.throwIfAborted();
      const reservation=await this.budget.execute({context,operationId:preparation.validationId});
      if(reservation.outcome==="denied")return{ok:false as const,failure:messagingFailure(reservation.code)};
      if(reservation.outcome==="already_reserved")return await this.recoverReserved({context,input,command,signal,validationId:preparation.validationId,reservedAt:reservation.reservedAt});
      signal.throwIfAborted();
      const credential=await this.secrets.loadAuthorizedSecret(context);
      const current=await this.resolver.execute(command);if(!current.allowed)return{ok:false as const,failure:current.failure};
      requireSameValidator(context,current.context);
      signal.throwIfAborted();
      const outcome=await inspectCredentialOutcome(this.inspectors.create(context,credential),signal);
      signal.throwIfAborted();
      return{ok:true as const,value:await this.operations.complete(context,input,preparation.validationId,outcome)};
    }catch(error){
      return{ok:false as const,failure:validationFailure(error,{prepared,operationId:input.operationId})};
    }
  }
  /** A consumed reservation is never inspected again: after the grace period the original validation completes as unavailable. @returns The original result, its pending progress or the unavailable completion. */
  private async recoverReserved({context,input,command,signal,validationId,reservedAt}:{context:AuthorizedMessagingContext;input:ValidateMessagingConnectionInput;command:Parameters<ResolveMessagingContextUseCase["execute"]>[0];signal:AbortSignal;validationId:string;reservedAt:Date}){
    const original=await this.operations.read(context,input);if(original?.state===OPERATION_STATE.completed)return{ok:true as const,value:original};
    const age=this.clock().getTime()-reservedAt.getTime();
    if(!Number.isFinite(age)||age<MESSAGING_CREDENTIAL_RECOVERY_GRACE_MS)return{ok:true as const,value:{state:OPERATION_STATE.started,operationId:input.operationId}};
    signal.throwIfAborted();
    const current=await this.resolver.execute(command);if(!current.allowed)return{ok:false as const,failure:current.failure};
    requireSameValidator(context,current.context);
    return{ok:true as const,value:await this.operations.complete(context,input,validationId,{ok:false,code:MESSAGING_ERROR_CODE.dependencyUnavailable})};
  }
}

/** @param original - Original resolved principal and resource. @param current - Facts after an awaited read. @throws MessagingConnectionOperationError when the session or the scope changed. */
function requireSameValidator(original:AuthorizedMessagingContext,current:AuthorizedMessagingContext):void{
  if(original.actorUserId!==current.actorUserId||original.sessionId!==current.sessionId||original.accountId!==current.accountId||original.subject!==current.subject)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
  if(!sameValidationScope(original,current))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.connectionConflict);
}

/** @param inspector - Scoped provider reader. @param signal - Caller cancellation/deadline. @returns The inspection, or the classified provider rejection; aborts and unknown errors propagate. */
async function inspectCredentialOutcome(inspector:ReturnType<MessagingCredentialInspectorFactory["create"]>,signal:AbortSignal):Promise<MessagingCredentialValidationOutcome>{
  try{return{ok:true,inspection:await inspector.inspectCredential(signal)};}
  catch(error){if(signal.aborted)throw error;if(!(error instanceof MessagingConnectionInspectionError))throw error;return{ok:false,code:error.code};}
}

/** @param error - Failure of the validation attempt. @param state - Whether the operation was prepared, and its id. @returns The safe failure, keeping the registered operation reference. */
function validationFailure(error:unknown,{prepared,operationId}:{prepared:boolean;operationId:string}){
  const known=error instanceof MessagingConnectionOperationError||error instanceof MessagingSecretAccessError||error instanceof MessagingUsageBudgetError;
  const registered=prepared||error instanceof MessagingConnectionOperationError&&error.operationId===operationId;
  const unknownCode=prepared?MESSAGING_ERROR_CODE.operationUnresolved:MESSAGING_ERROR_CODE.unexpectedFailure;
  const proposedCode=known?error.code:unknownCode;
  const code=proposedCode===MESSAGING_ERROR_CODE.operationUnresolved&&!registered?MESSAGING_ERROR_CODE.unexpectedFailure:proposedCode;
  return messagingFailure(code,{cause:error,...(code===MESSAGING_ERROR_CODE.operationUnresolved&&registered?{operation:{state:OPERATION_STATE.started,operationId}}:{})});
}
