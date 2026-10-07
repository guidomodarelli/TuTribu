/** Defines creation intent and private current tribe authority without provider or persistence details. @module messaging-connection-management */
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { MessagingUsageContext } from "./messaging-usage-operations";

/** Uses tribe-scoped recency before a new connection or secret exists. */
export type MessagingConnectionCreationContext = MessagingUsageContext & {
  operation: "save_messaging_credentials"; resourceId: string; accountId: string; subject: string;
  authenticatedAt: Date; validUntil: Date;
};
/** The credential is transient server input, never a stored/public operation payload. */
export type MessagingConnectionCreationInput = { operationId: string; confirmed: true; providerId: "zavu"; name: string; apiKey: string };
/** Application owns the minimal result; an adapter must recheck authority at claim, mutation and completion. */
export interface MessagingConnectionCreator<Result> {
  /** @param context - Current exact human/session/tribe recency. @param input - Original boundary-normalized intent. @returns Committed original metadata or genuinely registered progress. */
  create(context: MessagingConnectionCreationContext, input: MessagingConnectionCreationInput): Promise<AdmissionOperationResult<Result>>;
}
