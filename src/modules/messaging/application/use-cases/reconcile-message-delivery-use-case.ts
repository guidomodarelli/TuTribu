/** Reconciles one owned original transport without retrying a send or releasing usage. @module reconcile-message-delivery-use-case */
import type { MessagingAccountProvider, AuthorizedMessagingContext } from "../../domain/repositories/messaging-repositories";
import type { MessageReconciliationQuery, MessageReconciliationRepository } from "../../domain/repositories/message-reconciliation-repository";
import type { MessageStatusLookup, MessageStatusReference, OriginalMessageContextQuery } from "../../domain/repositories/message-status-lookup";
import type { ResolveMessagingContextUseCase } from "./resolve-messaging-context-use-case";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { MessagingConnectionInspectionError } from "../../domain/errors/messaging-connection-inspection-error";
import { MessagingDeliveryStorageError } from "../../domain/errors/messaging-delivery-storage-error";
import { messagingFailure } from "../results/messaging-errors";

/** Binds authority to the original stored version and preserves the existing closed resolver outcome. */
export type OriginalMessageContextResolver = { execute(query: OriginalMessageContextQuery): ReturnType<ResolveMessagingContextUseCase["execute"]> };

/** Closed failure of a denied original context resolution. */
type OriginalMessageContextFailure = Extract<Awaited<ReturnType<OriginalMessageContextResolver["execute"]>>, { allowed: false }>["failure"];

/**
 * @param resolver - Current exact leader/connection authority.
 * @param reference - Original immutable message metadata.
 * @param deny - Builds the caller's own error for a denied resolution.
 * @returns Current native reconciliation authority bound to the original stored tribe, connection and version.
 * @throws MessagingSecretAccessError when the current authority belongs to another resource or operation.
 */
export async function resolveOriginalReconciliationContext(resolver: OriginalMessageContextResolver, reference: MessageStatusReference, deny: (failure: OriginalMessageContextFailure) => Error): Promise<AuthorizedMessagingContext> {
  const resolved = await resolver.execute({ tribeId: reference.tribeId, connectionId: reference.connectionId, connectionVersion: reference.connectionVersion, operation: MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile, requestId: reference.requestId });
  if (!resolved.allowed) throw deny(resolved.failure);
  const context = resolved.context;
  if (context.tribeId !== reference.tribeId || context.connectionId !== reference.connectionId || context.connectionVersion !== reference.connectionVersion || context.resourceId !== reference.connectionId || context.operation !== MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  return context;
}

/** Original account, context, reconciliation and lookup owners; the clock defaults to the host time. */
export type ReconcileMessageDeliveryDependencies<Result> = { accounts: MessagingAccountProvider; resolver: OriginalMessageContextResolver; repository: MessageReconciliationRepository<Result>; lookup: MessageStatusLookup; clock?: () => Date };

/** Keeps provider reads outside native transactions and rechecks authority before persistence. */
export class ReconcileMessageDeliveryUseCase<Result> {
  private readonly accounts: MessagingAccountProvider;
  private readonly resolver: OriginalMessageContextResolver;
  private readonly repository: MessageReconciliationRepository<Result>;
  private readonly lookup: MessageStatusLookup;
  private readonly clock: () => Date;
  /** @param dependencies - `accounts`: Actual native account/session projection. `resolver`: Current exact leader/connection authority. `repository`: Protected original selector and DB-only writer. `lookup`: Read-only provider port. `clock`: Time sampled after awaited authority reads. */
  constructor({ accounts, resolver, repository, lookup, clock = () => new Date() }: ReconcileMessageDeliveryDependencies<Result>) { this.accounts = accounts; this.resolver = resolver; this.repository = repository; this.lookup = lookup; this.clock = clock; }

  /** @param reference - Native original reference. @param actor - Original server principal. @param session - Original session. @returns Current exact reconciliation authority. @throws MessagingSecretAccessError on revoked, changed or insufficient authority. */
  private async authorize(reference: MessageStatusReference, actor: string, session: string): Promise<AuthorizedMessagingContext> {
    const context = await resolveOriginalReconciliationContext(this.resolver, reference, (failure) => new MessagingConnectionInspectionError(failure.code, { cause: failure.cause }));
    if (context.actorUserId !== actor || context.sessionId !== session) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
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
      if (selected?.tribeId !== query.tribeId || selected.deliveryId !== query.deliveryId || selected.requestId !== query.requestId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
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
