/** Preserves the private purge failure and actual persistence cause without exposing material. @module messaging-secret-material-error */
import type {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {SECRET_MATERIAL_PURGE} from "@/src/modules/messaging/constants/secret-material-maintenance";

/** Keeps maintenance rejection or an indeterminate commit distinct from a confirmed purge count. */
export class MessagingSecretMaterialError extends Error {
  /**
   * @param code - Closed own authorization, input or persistence failure.
   * @param options - Actual caught cause, kept private when a transaction could not be observed.
   */
  constructor(public readonly code:(typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE],options?:ErrorOptions){
    super(`MessagingSecretMaterialMaintenance.${SECRET_MATERIAL_PURGE.operation} failed: ${code}`,options);
    this.name="MessagingSecretMaterialError";
  }
}
