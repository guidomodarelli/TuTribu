/** Recovers one original notification operation under current leadership without requiring fresh recency or keys. @module read-notification-recovery-operation-use-case */
import type { ResolveMessagingTribeManagementUseCase } from "./resolve-messaging-tribe-management-use-case";
import type { NotificationRecoveryOperationReader } from "../../domain/repositories/notification-recovery-operation-reader";
import { notificationRecoveryOperationSchema } from "../../constants/notification-delivery-recovery-schema";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MessagingUsageOperationError } from "../../domain/errors/messaging-usage-operation-error";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { messagingFailure } from "../results/messaging-errors";

/** Keeps the query isolated from mutating recovery, ledger claims and provider transport. */
export class ReadNotificationRecoveryOperationUseCase {
  /** @param management - Current native account/session/canonical leader, without a sensitive action. @param reader - Own actor/tribe/namespace readonly ledger adapter. */
  constructor(private readonly management: Pick<ResolveMessagingTribeManagementUseCase, "execute">, private readonly reader: NotificationRecoveryOperationReader) {}

  /** @param query - Once-validated exact tribe, original UUID and correlation. @returns Historical original public metadata or a safe current denial without another mutation. */
  async execute(query: { tribeId: string; operationId: string; requestId: string }) {
    try {
      const before = await this.management.execute({ tribeId: query.tribeId, requestId: query.requestId });
      const value = await this.reader.read(before, query.operationId);
      const current = await this.management.execute({ tribeId: query.tribeId, requestId: query.requestId });
      if (before.actorUserId !== current.actorUserId || before.sessionId !== current.sessionId) return { ok: false as const, failure: messagingFailure(MESSAGING_ERROR_CODE.authenticationRequired) };
      if (value === null) return { ok: false as const, failure: messagingFailure(MESSAGING_ERROR_CODE.resourceUnavailable) };
      const parsed = notificationRecoveryOperationSchema.safeParse(value);
      if (!parsed.success || parsed.data.operationId.toLowerCase() !== query.operationId.toLowerCase()) return { ok: false as const, failure: messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable) };
      return { ok: true as const, value: parsed.data };
    } catch (error) {
      const known = error instanceof MessagingUsageOperationError || error instanceof MessagingSecretAccessError || error instanceof AdmissionOperationError;
      const code = known ? Object.values(MESSAGING_ERROR_CODE).find((candidate) => candidate === error.code) ?? MESSAGING_ERROR_CODE.unexpectedFailure : MESSAGING_ERROR_CODE.unexpectedFailure;
      return { ok: false as const, failure: messagingFailure(code, { cause: error }) };
    }
  }
}
