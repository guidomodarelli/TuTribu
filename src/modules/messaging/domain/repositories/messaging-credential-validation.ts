/** Defines staged credential inspection without holding a database transaction during provider access. @module messaging-credential-validation */
import type { AuthorizedMessagingContext } from "./messaging-repositories";
import type { MessagingCredentialInspection,MessagingConnectionInspector } from "./messaging-connection-inspector";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Stable public intent carries no key, authority or provider response. */
export type MessagingCredentialValidationInput={operationId:string;confirmed:true;expectedVersion:number};
/** The inspector gets an already-authorized explicit private resource and credential. */
export interface MessagingCredentialInspectorFactory {
  /** @param context - Current exact resource/actor/security scope. @param credential - Transient private material from SecretStore. @returns A fresh read-only credential inspector. */
  create(context:AuthorizedMessagingContext,credential:string):Pick<MessagingConnectionInspector,"inspectCredential">;
}
/** Minimal public facts are distinct from private project/team/key references. */
export type MessagingCredentialValidationResult={id:string;version:number;configurationVersion:number;credentialState:"valid"|"invalid"|"unavailable";credentialMode:"production"|"test"|"unknown";validatedAt:string;failureCode?:(typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE]};
/** A private preparation id identifies the budget reservation; it is never returned to HTTP. */
export type PreparedMessagingCredentialValidation={state:"prepared";validationId:string;configurationVersion:number};
/** Only an adapter-classified outcome can be persisted; raw provider objects never cross this port. */
export type MessagingCredentialValidationOutcome={ok:true;inspection:MessagingCredentialInspection}|{ok:false;code:(typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE]};
/** DB-only stages commit independently; none accepts a callback that can invoke the provider. */
export interface MessagingCredentialValidationOperations {
  /** @param context - Current exact native authority. @param input - Stable original intent. @returns Historical final result, genuine progress, or a private preparation whose budget may be claimed once. */
  prepare(context:AuthorizedMessagingContext,input:MessagingCredentialValidationInput):Promise<PreparedMessagingCredentialValidation|AdmissionOperationResult<MessagingCredentialValidationResult>>;
  /** @param context - Current exact native authority. @param input - Stable original intent. @returns Original final result or absence without another provider call. */
  read(context:AuthorizedMessagingContext,input:MessagingCredentialValidationInput):Promise<AdmissionOperationResult<MessagingCredentialValidationResult>|null>;
  /** @param context - Original exact resource whose authority must still be current. @param input - Original public intent. @param validationId - Committed private preparation/budget id. @param outcome - Consumed private facts or safe classification. @returns Atomic credential metadata and original result, without activating a channel. */
  complete(context:AuthorizedMessagingContext,input:MessagingCredentialValidationInput,validationId:string,outcome:MessagingCredentialValidationOutcome):Promise<AdmissionOperationResult<MessagingCredentialValidationResult>>;
}
