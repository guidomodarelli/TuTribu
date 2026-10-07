/** Exposes a classified inspection outcome without depending on provider HTTP or SDK types. @module messaging-connection-inspection-error */
import type { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Carries the private cause while application sees only an owned semantic code. */
export class MessagingConnectionInspectionError extends Error {
  /** @param code - Owned outcome classified by the adapter. @param options - Actual private cause. */
  constructor(public readonly code:(typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE],options?:ErrorOptions){
    super(`MessagingConnection.inspect failed: ${code}`,options);this.name="MessagingConnectionInspectionError";
  }
}
