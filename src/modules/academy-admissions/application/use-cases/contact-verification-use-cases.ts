/** Orchestrates explicit admission verification with server-owned account/contact and post-commit dispatch recovery. @module contact-verification-use-cases */
import type {AuthenticatedAccountProvider} from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import {isAuthenticatedSessionLive} from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type {AdmissionContactVerificationOperations,AdmissionContactChallengeDispatcher,AdmissionVerificationAccountScope,AdmissionChallengeSnapshot,AdmissionChallengeVerificationSnapshot} from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import type {AdmissionOperationResult} from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import {normalizeAdmissionContact} from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import {ADMISSION_CONTACT_TYPE,ADMISSION_CONTACT_NORMALIZATION_STATUS} from "@/src/modules/academy-admissions/constants/admission-contact";
import {ADMISSION_VERIFICATION_PURPOSE} from "@/src/modules/academy-admissions/constants/admission-eligibility";
import {ADMISSION_REQUEST_SOURCE} from "@/src/modules/academy-admissions/constants/admission-request";
import {ADMISSION_ERROR_CODE} from "@/src/modules/academy-admissions/constants/admission-errors";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {AdmissionOperationError} from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import {admissionFailure} from "../results/admission-errors";
import {admissionOperationFailure} from "../results/admission-operation-failure";

/** Routing and input schemas cannot select account, email, proof purpose, credential or connection. */
type AdmissionVerificationInputScope={tribeId:string;requestId:string;operationId:string};
/** Contact and source choices remain proposals; the writer owns current policy and resource authority. */
export type IssueAdmissionContactChallengeInput=AdmissionVerificationInputScope&{expectedPolicyVersion:number;confirmed:true;channel:"email"|"sms"|"whatsapp";phone?:string;country?:string;admissionRequestId?:string;invitationToken?:string;legacyInvitationToken?:string};
/** The original challenge supplies all contact/resource facts for local code consumption. */
export type VerifyAdmissionContactChallengeInput=AdmissionVerificationInputScope&{challengeId:string;verificationCode:string};
/** A resend changes neither recipient nor identity and has no arbitrary channel fallback. */
export type ResendAdmissionContactChallengeInput=AdmissionVerificationInputScope&{challengeId:string;useSmsAlternative?:true};

/** Keeps policy and persistence authority in the atomic owner while preserving original asynchronous effects. */
export class ContactVerificationUseCases{
  /** @param accounts - Native private current global account. @param operations - Atomic issue/verify/resend owner without transport. @param dispatcher - Focal launch after confirmed issuance only. @param clock - Fresh time sampled after the native account lookup. */
  constructor(private readonly accounts:AuthenticatedAccountProvider,private readonly operations:AdmissionContactVerificationOperations,private readonly dispatcher:AdmissionContactChallengeDispatcher,private readonly clock:()=>Date){}

  /** @param input - Boundary-validated route and original correlation. @returns Native account/email and fixed admission scope without caller permissions. @throws AdmissionOperationError when the current account or session is unavailable. */
  private async principal(input:AdmissionVerificationInputScope){
    const account=await this.accounts.getAuthenticatedAccount();
    if(!account||!isAuthenticatedSessionLive(account.session.expiresAt,this.clock()))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    const scope:AdmissionVerificationAccountScope={userId:account.userId,sessionId:account.session.id,tribeId:input.tribeId,requestId:input.requestId,purpose:ADMISSION_VERIFICATION_PURPOSE.admission};
    return{scope,email:account.normalizedEmail};
  }

  /** @param operationId - Exact original client identity. @param value - Own writer result. @returns Nothing when identity and completed proof purpose match. @throws AdmissionOperationError before exposing or dispatching a crossed original. */
  private assertOriginal(operationId:string,value:AdmissionOperationResult<AdmissionChallengeSnapshot|AdmissionChallengeVerificationSnapshot>):void{
    if(value.operationId!==operationId||value.state===OPERATION_STATE.completed&&value.result.purpose!==ADMISSION_VERIFICATION_PURPOSE.admission)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  }

  /** @param operationId - Exact original client identity. @param error - Actual private owner failure. @returns Only progress bound to that original, preserving private causes on a crossed identity. */
  private failure(operationId:string,error:unknown){
    if(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved&&error.operationId&&error.operationId!==operationId)return admissionOperationFailure(new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable,{cause:error}));
    return admissionOperationFailure(error);
  }

  /** @param scope - Actual native account and tribe. @param operationId - Original issuance identity. @param value - Confirmed own issuance or registered progress. @param expectedChannel - Explicit consented issuance channel or requested SMS alternative. @returns Original result or completed-operation uncertainty without another send. */
  private async observe(scope:AdmissionVerificationAccountScope,operationId:string,value:AdmissionOperationResult<AdmissionChallengeSnapshot>,expectedChannel?:AdmissionChallengeSnapshot["channel"]){
    this.assertOriginal(operationId,value);
    if(value.state===OPERATION_STATE.completed&&expectedChannel&&value.result.channel!==expectedChannel)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
    if(value.state===OPERATION_STATE.completed&&!value.replayed){
      try{await this.dispatcher.dispatch({userId:scope.userId,sessionId:scope.sessionId,tribeId:scope.tribeId,requestId:scope.requestId,challengeId:value.result.challengeId});}
      catch(error){return{ok:false as const,failure:admissionFailure(ADMISSION_ERROR_CODE.operationUnresolved,{cause:error,operation:{operationId,state:OPERATION_STATE.completed}})};}
    }
    return{ok:true as const,value};
  }

  /** @param input - Confirmed current policy/contact proposal, with email derived from the account. @returns Original issuance/progress or safe failure; Gmail does not bypass the policy owner. */
  async issue(input:IssueAdmissionContactChallengeInput){
    try{
      const {scope,email}=await this.principal(input);
      if(!input.confirmed||input.country&&!input.phone||input.invitationToken&&input.legacyInvitationToken)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const normalized=normalizeAdmissionContact(input.phone?{type:ADMISSION_CONTACT_TYPE.phone,value:input.phone,country:input.country}:{type:ADMISSION_CONTACT_TYPE.email,value:email});
      if(normalized.status!==ADMISSION_CONTACT_NORMALIZATION_STATUS.valid||normalized.contact.type===ADMISSION_CONTACT_TYPE.email&&input.channel!==MESSAGING_PUBLIC_CHANNEL.email||normalized.contact.type===ADMISSION_CONTACT_TYPE.phone&&input.channel===MESSAGING_PUBLIC_CHANNEL.email)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const source=input.invitationToken?{kind:ADMISSION_REQUEST_SOURCE.personal,token:input.invitationToken}:input.legacyInvitationToken?{kind:ADMISSION_REQUEST_SOURCE.legacy,token:input.legacyInvitationToken}:{kind:ADMISSION_REQUEST_SOURCE.common};
      const value=await this.operations.issue({...scope,operationId:input.operationId,expectedPolicyVersion:input.expectedPolicyVersion,confirmed:input.confirmed,contact:normalized.contact,channel:input.channel,admissionRequestId:input.admissionRequestId??null,source});
      return await this.observe(scope,input.operationId,value,input.channel);
    }catch(error){return this.failure(input.operationId,error);}
  }

  /** @param input - Original own challenge and exact code; no provider prerequisite is added. @returns Original local proof/progress or a safe owner denial without dispatch. */
  async verify(input:VerifyAdmissionContactChallengeInput){
    try{const {scope}=await this.principal(input),value=await this.operations.verify({...scope,operationId:input.operationId,challengeId:input.challengeId,verificationCode:input.verificationCode});this.assertOriginal(input.operationId,value);return{ok:true as const,value};}
    catch(error){return this.failure(input.operationId,error);}
  }

  /** @param input - Exact current original challenge and optional explicit SMS alternative. @returns New committed challenge or original uncertainty without changing recipient or resetting consumption. */
  async resend(input:ResendAdmissionContactChallengeInput){
    try{const {scope}=await this.principal(input),value=await this.operations.resend({...scope,operationId:input.operationId,challengeId:input.challengeId,...(input.useSmsAlternative?{useSmsAlternative:input.useSmsAlternative}:{})});return await this.observe(scope,input.operationId,value,input.useSmsAlternative?MESSAGING_PUBLIC_CHANNEL.sms:undefined);}
    catch(error){return this.failure(input.operationId,error);}
  }
}
