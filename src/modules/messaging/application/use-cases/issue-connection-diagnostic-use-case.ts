/** Commits one consented local-code intent before focal external dispatch without confusing transport with proof. @module issue-connection-diagnostic */
import type {ResolveMessagingContextUseCase} from "./resolve-messaging-context-use-case";
import type {ConnectionDiagnosticIssueOperations,ConnectionDiagnosticDispatcher} from "@/src/modules/messaging/domain/repositories/connection-diagnostic-issuance";
import {normalizeAdmissionContact} from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import {ADMISSION_CONTACT_TYPE,ADMISSION_CONTACT_NORMALIZATION_STATUS} from "@/src/modules/academy-admissions/constants/admission-contact";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {MessagingDiagnosticOperationError} from "@/src/modules/messaging/domain/errors/messaging-diagnostic-operation-error";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {messagingFailure} from "../results/messaging-errors";

/** HTTP validates shape once; the owned contact value object applies canonical business meaning. */
export type IssueConnectionDiagnosticInput={tribeId:string;connectionId:string;requestId:string;operationId:string;expectedVersion:number;confirmed:true;channel:"email"|"sms"|"whatsapp";recipient:string;country?:string;currentChallengeId?:string};
/** A replay never restarts dispatch and any failed observation preserves the committed issuance. */
export class IssueConnectionDiagnosticUseCase{
  /** @param resolver - Current exact leader/session/recency/resource authority. @param operations - Atomic owned issuance/budgets/outbox ledger. @param dispatcher - Focal backend-only observed launch for one committed obligation. */
  constructor(private readonly resolver:Pick<ResolveMessagingContextUseCase,"execute">,private readonly operations:ConnectionDiagnosticIssueOperations,private readonly dispatcher:ConnectionDiagnosticDispatcher){}
  /** @param input - Original confirmed destination and server routing scope. @returns Original safe issuance, registered progress or a current safe denial; provider acceptance never becomes verification. */
  async execute(input:IssueConnectionDiagnosticInput){
    try{
      const recipient=normalizeAdmissionContact({type:input.channel===MESSAGING_PUBLIC_CHANNEL.email?ADMISSION_CONTACT_TYPE.email:ADMISSION_CONTACT_TYPE.phone,value:input.recipient,...(input.country?{country:input.country}:{})});
      if(recipient.status!==ADMISSION_CONTACT_NORMALIZATION_STATUS.valid)return{ok:false as const,failure:messagingFailure(MESSAGING_ERROR_CODE.invalidInput)};
      const authorization=await this.resolver.execute({tribeId:input.tribeId,connectionId:input.connectionId,requestId:input.requestId,operation:REAUTHENTICATION_OPERATION.diagnoseMessagingConnection});
      if(!authorization.allowed)return{ok:false as const,failure:authorization.failure};
      const value=await this.operations.issue(authorization.context,{operationId:input.operationId,expectedVersion:input.expectedVersion,confirmed:input.confirmed,channel:input.channel,recipient:recipient.contact,...(input.currentChallengeId?{currentChallengeId:input.currentChallengeId}:{})});
      if(value.state===OPERATION_STATE.completed&&!value.replayed&&value.result.outcome==="issued"){
        try{await this.dispatcher.dispatch(authorization.context,value.result.deliveryId);}
        catch(error){return{ok:false as const,failure:messagingFailure(MESSAGING_ERROR_CODE.operationUnresolved,{cause:error,operation:{operationId:input.operationId,state:OPERATION_STATE.completed}})};}
      }
      return{ok:true as const,value};
    }catch(error){
      const code=error instanceof MessagingDiagnosticOperationError||error instanceof MessagingSecretAccessError?error.code:MESSAGING_ERROR_CODE.unexpectedFailure;
      return{ok:false as const,failure:messagingFailure(code,{cause:error,...(error instanceof MessagingDiagnosticOperationError&&error.code===MESSAGING_ERROR_CODE.operationUnresolved&&error.operationId?{operation:{operationId:error.operationId,state:OPERATION_STATE.started}}:{})})};
    }
  }
}
