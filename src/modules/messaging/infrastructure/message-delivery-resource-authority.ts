/** Defines injected purpose-specific native guards without coupling the generic outbox or secret store to one feature. @module message-delivery-resource-authority */
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedDeliveryMessagingContext } from "../domain/repositories/messaging-repositories";

/** Repeats current fixed backend authority without taking domain locks before the canonical tribe fence. */
export type MessageDeliveryPurposeAuthorizer = (database: RequestDatabase, tribeId: string) => Promise<boolean>;
/** Evaluates the actual queued resource before a reservation or possible-send marker can be committed. */
export type QueuedMessageDeliveryResourceAuthority = (database: RequestDatabase, scope: { tribeId: string; deliveryId: string }, authorize: MessageDeliveryPurposeAuthorizer) => Promise<boolean>;
/** Revalidates a committed exact marker's business resource before generic secret/provider authorization takes its locks. */
export type MarkedMessageDeliveryResourceAuthority = (database: RequestDatabase, context: AuthorizedDeliveryMessagingContext) => Promise<void>;
