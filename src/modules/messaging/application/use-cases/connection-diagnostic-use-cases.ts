/** Resolves current sensitive-leader identity before explicit local diagnostic confirmation. @module connection-diagnostic-use-cases */
import type { ResolveMessagingContextUseCase } from "./resolve-messaging-context-use-case";
import type { ConnectionDiagnosticOperations } from "@/src/modules/messaging/domain/repositories/connection-diagnostic-repository";
import type { ConnectionDiagnosticSnapshot } from "@/src/modules/messaging/application/results/connection-diagnostic-result";
import { CONNECTION_DIAGNOSTIC_VERIFY_OPERATION } from "@/src/modules/messaging/constants/connection-diagnostic";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { messagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";
import { MessagingDiagnosticOperationError } from "@/src/modules/messaging/domain/errors/messaging-diagnostic-operation-error";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** Validated client intent contains no account, role, key, sender, destination or private permission token. */
export type VerifyConnectionDiagnosticInput = { tribeId: string; connectionId: string; diagnosticId: string; operationId: string; code: string; requestId: string };

/** Derives private authority on each request and leaves transport/activation to their separate owners. */
export class VerifyConnectionDiagnosticUseCase {
  /**
   * @param resolver - Own current global account/role/recency/resource resolver.
   * @param operations - Owner-bound ledger and local diagnostic transaction composition.
   */
  constructor(private readonly resolver: Pick<ResolveMessagingContextUseCase, "execute">, private readonly operations: ConnectionDiagnosticOperations<ConnectionDiagnosticSnapshot>) {}

  /**
   * Confirms an explicitly received diagnostic code without initiating any message or activating a connection.
   * @param input - Original boundary-validated action, with server correlation and resource identity.
   * @returns A confirmed original snapshot, registered progress or a safe own failure.
   */
  async execute(input: VerifyConnectionDiagnosticInput) {
    try {
      const authorization = await this.resolver.execute({ tribeId: input.tribeId, connectionId: input.connectionId, operation: CONNECTION_DIAGNOSTIC_VERIFY_OPERATION, requestId: input.requestId });
      if (!authorization.allowed) return { ok: false as const, failure: authorization.failure };
      const value = await this.operations.verify({ context: authorization.context, diagnosticId: input.diagnosticId, operationId: input.operationId, code: input.code });
      return { ok: true as const, value };
    } catch (error) {
      if (error instanceof MessagingDiagnosticOperationError) return { ok: false as const, failure: messagingFailure(error.code, { cause: error, ...(error.code === MESSAGING_ERROR_CODE.operationUnresolved && error.operationId ? { operation: { operationId: error.operationId, state: OPERATION_STATE.started } } : {}) }) };
      return { ok: false as const, failure: messagingFailure(MESSAGING_ERROR_CODE.unexpectedFailure, { cause: error }) };
    }
  }
}
