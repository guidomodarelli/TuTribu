/** Preserves a private provider failure while exposing only an owned semantic inspection outcome. @module zavu-inspection-error */
import type { MessagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";
import { MessagingConnectionInspectionError } from "@/src/modules/messaging/domain/errors/messaging-connection-inspection-error";

/** Carries status/cause to the owning server boundary without provider message text in Error.message. */
export class ZavuInspectionError extends MessagingConnectionInspectionError {
  /** @param operation - Fixed read operation. @param failure - Classified private failure with its original cause. */
  constructor(operation: string, public readonly failure: MessagingFailure) {
    super(failure.code, { cause: failure.cause });
    this.name = "ZavuInspectionError";
    this.message = `ZavuConnectionInspector.${operation} failed: ${failure.code}`;
  }
}
