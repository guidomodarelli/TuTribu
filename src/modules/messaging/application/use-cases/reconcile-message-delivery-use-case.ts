/** Reconciles one owned original transport without retrying a send or releasing usage. @module reconcile-message-delivery-use-case */
import type { MessagingAccountProvider, AuthorizedMessagingContext } from "../../domain/repositories/messaging-repositories";
import type { MessageReconciliationQuery, MessageReconciliationRepository } from "../../domain/repositories/message-reconciliation-repository";
import type { MessageStatusLookup, MessageStatusReference } from "../../domain/repositories/message-status-lookup";
import type { ResolveMessagingContextUseCase } from "./resolve-messaging-context-use-case";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { MessagingConnectionInspectionError } from "../../domain/errors/messaging-connection-inspection-error";
import { MessagingDeliveryStorageError } from "../../domain/errors/messaging-delivery-storage-error";
import { messagingFailure } from "../results/messaging-errors";

/** Keeps provider reads outside native transactions and rechecks authority before persistence. */
export class ReconcileMessageDeliveryUseCase<Result> {
  /** @param accounts - Actual native account/session projection. @param resolver - Current exact leader/connection/recency authority. @param repository - Protected original selector and DB-only writer. @param lookup - Read-only provider port. @param clock - Time sampled after awaited authority reads. */
  constructor(private readonly accounts: MessagingAccountProvider, private readonly resolver: Pick<ResolveMessagingContextUseCase, "execute">, private readonly repository: MessageReconciliationRepository<Result>, private readonly lookup: MessageStatusLookup, private readonly clock: () => Date = () => new Date()) {}

  /** @param reference - Native original reference. @param actor - Original server principal. @param session - Original session. @returns Current exact reconciliation authority. @throws MessagingSecretAccessError on revoked, changed or insufficient authority. */
  private async authorize(reference: MessageStatusReference, actor: string, session: string): Promise<AuthorizedMessagingContext> {
    const resolved = await this.resolver.execute({ tribeId: reference.tribeId, connectionId: reference.connectionId, operation: MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile, requestId: reference.requestId });
    if (!resolved.allowed) throw new MessagingConnectionInspectionError(resolved.failure.code, { cause: resolved.failure.cause });
    const context = resolved.context;
    if (context.actorUserId !== actor || context.sessionId !== session || context.tribeId !== reference.tribeId || context.connectionId !== reference.connectionId || context.connectionVersion !== reference.connectionVersion || context.resourceId !== reference.connectionId || context.operation !== MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    return context;
  }

  /** @param query - Boundary-validated own resource and correlation. @param signal - Cancellation of this single read. @returns Safe internal success/failure without provider ID, secret or implicit recovery. */
  async execute(query: MessageReconciliationQuery, signal: AbortSignal) {
    try {
      signal.throwIfAborted();
      const account = await this.accounts.getAuthenticatedAccount();
      if (!account || !isAuthenticatedSessionLive(account.session.expiresAt, this.clock())) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
      const selected = await this.repository.readReference({ actorUserId: account.userId, sessionId: account.session.id, tribeId: query.tribeId, requestId: query.requestId }, query.deliveryId);
      signal.throwIfAborted();
      if (!selected || selected.tribeId !== query.tribeId || selected.deliveryId !== query.deliveryId || selected.requestId !== query.requestId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      const original = Object.freeze({ ...selected });
      const before = await this.authorize(original, account.userId, account.session.id);
      signal.throwIfAborted();
      const observation = await this.lookup.read(original, signal);
      signal.throwIfAborted();
      if (observation.providerMessageId !== original.providerMessageId) throw new MessagingConnectionInspectionError(MESSAGING_ERROR_CODE.upstreamPayloadUnusable);
      const current = await this.authorize(original, account.userId, account.session.id);
      signal.throwIfAborted();
      if (current.accountId !== before.accountId || current.subject !== before.subject || current.environment !== before.environment || current.securityEpoch !== before.securityEpoch || current.secretRef !== before.secretRef) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
      return { ok: true as const, value: await this.repository.record(current, original, observation) };
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted();
      const code = error instanceof MessagingSecretAccessError || error instanceof MessagingConnectionInspectionError || error instanceof MessagingDeliveryStorageError ? error.code : MESSAGING_ERROR_CODE.unexpectedFailure;
      return { ok: false as const, failure: messagingFailure(code, { cause: error }) };
    }
  }
}
