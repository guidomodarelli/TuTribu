/** Defines explicit diagnostic issuance and one focal dispatch independently of framework/provider adapters. @module connection-diagnostic-issuance */
import type {AuthorizedMessagingContext} from "./messaging-repositories";
import type {AdmissionContact} from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import type {AdmissionOperationResult} from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";

/** An original normalized intent contains no code, sender, provider text or credential. */
export type ConnectionDiagnosticIssueInput={operationId:string;expectedVersion:number;confirmed:true;channel:"email"|"sms"|"whatsapp";recipient:AdmissionContact;currentChallengeId?:string};
/** Transport state is queried separately; an issuance never claims delivery or local verification. */
export type ConnectionDiagnosticIssueResult={outcome:"issued";diagnosticId:string;challengeId:string;deliveryId:string;connectionId:string;connectionVersion:number;channel:"email"|"sms"|"whatsapp";maskedDestination:string;expiresAt:string;resendAllowedAt:string}|{outcome:"denied";code:(typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE]};
/** DB-only owner commits challenge/request budget/outbox/original metadata before any provider operation. */
export interface ConnectionDiagnosticIssueOperations{
  /** @param context - Current exact sensitive leader scope. @param input - Original normalized consent/destination/CAS intent. @returns Confirmed original issuance/denial or genuine registered progress. */
  issue(context:AuthorizedMessagingContext,input:ConnectionDiagnosticIssueInput):Promise<AdmissionOperationResult<ConnectionDiagnosticIssueResult>>;
}
/** Backend composition derives one private launch from the committed result, never from browser dispatch claims. */
export interface ConnectionDiagnosticDispatcher{
  /** @param context - Actual authorized issuance principal/resource. @param deliveryId - Exact obligation returned by the writer. @returns Nothing after bounded dispatch observation; a failure does not authorize repeating the issuance. */
  dispatch(context:AuthorizedMessagingContext,deliveryId:string):Promise<void>;
}
