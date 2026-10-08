/** Defines account-scoped admission verification operations and a focal post-commit launch without provider or storage authority. @module admission-contact-verification */
import type {AdmissionOperationResult} from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type {AdmissionContact} from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import type {AdmissionSubmissionIntent} from "./admission-repositories";

/** Uses native current identity; no caller can select another account, credential or diagnostic purpose. */
export type AdmissionVerificationAccountScope={userId:string;sessionId:string;tribeId:string;requestId:string;purpose:"admission"};
/** The current policy owner chooses the actual connection and rechecks all facts inside the atomic operation. */
export type AdmissionChallengeIssuanceIntent=AdmissionVerificationAccountScope&{operationId:string;expectedPolicyVersion:number;confirmed:true;contact:AdmissionContact;channel:"email"|"sms"|"whatsapp";admissionRequestId:string|null;source:AdmissionSubmissionIntent["source"]};
/** Validation resolves the original challenge contact and scope without an external send or a fresh destination. */
export type AdmissionChallengeVerificationIntent=AdmissionVerificationAccountScope&{operationId:string;challengeId:string;verificationCode:string};
/** Only an explicit permitted SMS alternative may alter the original challenge channel. */
export type AdmissionChallengeResendIntent=AdmissionVerificationAccountScope&{operationId:string;challengeId:string;useSmsAlternative?:true};
/** Minimal own commit metadata contains neither plaintext destination nor delivery/connection authorization. */
export type AdmissionChallengeSnapshot={challengeId:string;purpose:"admission";channel:"email"|"sms"|"whatsapp";maskedDestination:string;expiresAt:string;resendAllowedAt:string;deliveryState:"queued"|"accepted"|"delivered"|"failed"|"unknown"|"suppressed"|"cancelled";allowedAlternative?:"sms"};
/** Local proof creation does not create membership, session, global identity or notification delivery evidence. */
export type AdmissionChallengeVerificationSnapshot={purpose:"admission";result:"verified";proofId:string;applyBefore:string};
/** Each writer owns native session/policy/challenge locks, ledger, budgets and final immutable scope. */
export interface AdmissionContactVerificationOperations{
  /** @param intent - Original confirmed native account and normalized contact choice. @returns Original issuance or genuine registered progress after commit. */
  issue(intent:AdmissionChallengeIssuanceIntent):Promise<AdmissionOperationResult<AdmissionChallengeSnapshot>>;
  /** @param intent - Original own challenge and code intent. @returns An admission proof only after local consumption commits. */
  verify(intent:AdmissionChallengeVerificationIntent):Promise<AdmissionOperationResult<AdmissionChallengeVerificationSnapshot>>;
  /** @param intent - Original own challenge and explicit alternative choice. @returns A newly committed replacement without resetting shared consumption. */
  resend(intent:AdmissionChallengeResendIntent):Promise<AdmissionOperationResult<AdmissionChallengeSnapshot>>;
}
/** This scope permits only observing the account's committed challenge; infrastructure derives and revalidates its worker authority independently. */
export type AdmissionChallengeDispatchIntent=Omit<AdmissionVerificationAccountScope,"purpose">&{challengeId:string};
/** A replay never invokes this focal launch and the dispatcher cannot accept arbitrary sender, text, recipient or secret. */
export interface AdmissionContactChallengeDispatcher{
  /** @param intent - Exact committed own account/challenge identity. @returns Nothing after bounded observation, preserving the original obligation on uncertainty. */
  dispatch(intent:AdmissionChallengeDispatchIntent):Promise<void>;
}
