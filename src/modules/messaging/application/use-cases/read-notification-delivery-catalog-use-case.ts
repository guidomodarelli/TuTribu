/** Reads bounded notification metadata under current canonical leadership without fresh recency or writes. @module read-notification-delivery-catalog-use-case */
import type { ResolveMessagingTribeManagementUseCase } from "./resolve-messaging-tribe-management-use-case";
import type { NotificationDeliveryCatalogReader, NotificationDeliveryCatalogPosition } from "../../domain/repositories/notification-delivery-catalog-reader";
import { notificationDeliveryCatalogSchema } from "../../constants/notification-delivery-catalog";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MessagingUsageOperationError } from "../../domain/errors/messaging-usage-operation-error";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { messagingFailure } from "../results/messaging-errors";

/** Keeps current visibility distinct from sensitive recovery and its registered original operation. */
export class ReadNotificationDeliveryCatalogUseCase {
  /** @param management - Current actual account/session/canonical leader. @param reader - Owned bounded readonly projection. */
  constructor(private readonly management: Pick<ResolveMessagingTribeManagementUseCase, "execute">, private readonly reader: NotificationDeliveryCatalogReader) {}
  /** @param query - Once-validated tenant/cursor/correlation. @returns Guarded current metadata or safe denial, without claims, keys or provider queries. */
  async execute(query: { tribeId: string; requestId: string; cursor: NotificationDeliveryCatalogPosition | null }) {
    try {
      const before = await this.management.execute({ tribeId: query.tribeId, requestId: query.requestId });
      const value = await this.reader.read(before, query.cursor);
      const current = await this.management.execute({ tribeId: query.tribeId, requestId: query.requestId });
      if (before.actorUserId !== current.actorUserId || before.sessionId !== current.sessionId) return { ok: false as const, failure: messagingFailure(MESSAGING_ERROR_CODE.authenticationRequired) };
      const parsed = notificationDeliveryCatalogSchema.safeParse(value);
      return parsed.success ? { ok: true as const, value: parsed.data } : { ok: false as const, failure: messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable) };
    } catch (error) {
      const known = error instanceof MessagingUsageOperationError || error instanceof MessagingSecretAccessError;
      const code = known ? error.code : MESSAGING_ERROR_CODE.unexpectedFailure;
      return { ok: false as const, failure: messagingFailure(code, { cause: error }) };
    }
  }
}
