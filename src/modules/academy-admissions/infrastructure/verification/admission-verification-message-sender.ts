/** Starts one committed applicant challenge through independently derived backend scope and live external security. @module admission-verification-message-sender */
import "server-only";
import type {AdmissionContactChallengeDispatcher,AdmissionChallengeDispatchIntent} from "../../domain/repositories/admission-contact-verification";
import type {AdmissionDeliveryDispatchScope} from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type {MessagingSecurityFacts} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {DispatchMessageDeliveriesUseCase} from "@/src/modules/messaging/application/use-cases/dispatch-message-deliveries-use-case";
import {AdmissionOperationError} from "../../domain/errors/admission-operation-error";
import {ADMISSION_ERROR_CODE} from "../../constants/admission-errors";
import {ADMISSION_VERIFICATION_PURPOSE} from "../../constants/admission-eligibility";

/** The resolver privately authorizes account/challenge and returns no credential, destination or reusable browser permission. */
export type ResolvedAdmissionChallengeDispatch={scope:Readonly<AdmissionDeliveryDispatchScope>;environment:string;securityEpoch:string};
/** Hosting supplies native request resolution, one focal worker factory and a current security source explicitly. */
export type AdmissionVerificationDispatchDependencies={resolve:(intent:AdmissionChallengeDispatchIntent)=>Promise<ResolvedAdmissionChallengeDispatch>;readSecurityFacts:()=>Promise<MessagingSecurityFacts>;createDispatcher:(scope:Readonly<AdmissionDeliveryDispatchScope>,authorize:()=>Promise<boolean>)=>Pick<DispatchMessageDeliveriesUseCase,"execute">};

/** A confirmed obligation may be observed once; it never drains a queue or redirects an original challenge. */
export class ScopedAdmissionVerificationDispatcher implements AdmissionContactChallengeDispatcher{
  /** @param dependencies - Native resolver, backend transport/worker and retained host lifecycle without defaults. */
  constructor(private readonly dependencies:AdmissionVerificationDispatchDependencies){}
  /** @param intent - Exact confirmed own account/session/tribe/challenge identity. @returns After bounded focal observation; the original attempt preserves uncertain work. */
  async dispatch(intent:AdmissionChallengeDispatchIntent):Promise<void>{
    const original:AdmissionChallengeDispatchIntent={userId:intent.userId,sessionId:intent.sessionId,tribeId:intent.tribeId,requestId:intent.requestId,challengeId:intent.challengeId},resolved=await this.dependencies.resolve(original),scope=resolved.scope;
    if(scope.purpose!==ADMISSION_VERIFICATION_PURPOSE.admission||scope.applicantUserId!==original.userId||scope.tribeId!==original.tribeId||scope.challengeId!==original.challengeId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    const authorize=async()=>{const current=await this.dependencies.readSecurityFacts();return current.recoveryLocked===false&&current.environment===resolved.environment&&current.securityEpoch===resolved.securityEpoch;};
    await this.dependencies.createDispatcher(scope,authorize).execute();
  }
}
