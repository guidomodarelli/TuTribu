/** Commits diagnostic/code/capability effects and their minimal original result through the real ledger. @module postgres-connection-diagnostic-operations */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { ConnectionDiagnosticOperations, VerifyConnectionDiagnosticCommand } from "@/src/modules/messaging/domain/repositories/connection-diagnostic-repository";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { PostgresContactVerificationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-contact-verification-repository";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MessagingDiagnosticOperationError } from "@/src/modules/messaging/domain/errors/messaging-diagnostic-operation-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { CONNECTION_DIAGNOSTIC_VERIFY_OPERATION } from "@/src/modules/messaging/constants/connection-diagnostic";
import { connectionDiagnosticSnapshotSchema, projectConnectionDiagnosticSnapshot, type ConnectionDiagnosticSnapshot } from "@/src/modules/messaging/application/results/connection-diagnostic-result";
import { authorizeConnectionDiagnostic } from "./postgres-connection-diagnostic-authorizer";
import { PostgresVerificationFailureBudget } from "./postgres-verification-failure-budget";
import { PostgresConnectionDiagnosticRepository } from "./postgres-connection-diagnostic-repository";
import { executeMessagingLedger } from "./execute-messaging-ledger";

/** Holds one explicit server-derived actor context per guarded checkout. */
type DiagnosticDatabaseExecutor = <Result>(context: AuthorizedMessagingContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** Composes inward-facing verification ports without a mutable client, plaintext cache or provider call. */
export class PostgresConnectionDiagnosticOperations implements ConnectionDiagnosticOperations<ConnectionDiagnosticSnapshot> {
  /**
   * @param execute - Existing guarded server actor executor for claim and business transactions.
   * @param readSecurityConfig - Local hosting-secret snapshot, never an outbound request under locks.
   */
  constructor(private readonly execute: DiagnosticDatabaseExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /**
   * Recovers before code consumption and confirms every local effect with the original public snapshot.
   * @param input - Current owner context and original explicit diagnostic/code operation.
   * @returns Historical committed result or registered unfinished work without an invented success.
   * @throws MessagingDiagnosticOperationError for safe owner failure or genuinely indeterminate completion.
   */
  async verify(input: Omit<VerifyConnectionDiagnosticCommand, "ledgerId">): Promise<AdmissionOperationResult<ConnectionDiagnosticSnapshot>> {
    const context = input.context;
    const authorize = async (database: RequestDatabase) => {
      try { await authorizeConnectionDiagnostic(database, context, this.readSecurityConfig); return true; }
      catch (error) {
        if (error instanceof MessagingSecretAccessError) throw new AdmissionOperationError(error.code, { cause: error });
        throw error;
      }
    };
    const ledger = new PostgresAdmissionOperationRepository((run) => executeMessagingLedger(() => this.execute(context, run)), authorize, this.readSecurityConfig);
    const command = { actorUserId: context.actorUserId, tribeId: context.tribeId, operationType: CONNECTION_DIAGNOSTIC_VERIFY_OPERATION, idempotencyKey: input.operationId, intent: { diagnosticId: input.diagnosticId, connectionId: context.connectionId, connectionVersion: context.connectionVersion, code: input.code } };
    try {
      return await ledger.run(command, connectionDiagnosticSnapshotSchema, async (database, ledgerId) => {
        const failures = new PostgresVerificationFailureBudget(database);
        const verification = new PostgresContactVerificationRepository(database, async (transaction, scope) => {
          if (scope.userId !== context.actorUserId || scope.tribeId !== context.tribeId || scope.connectionId !== context.connectionId || scope.connectionVersion !== context.connectionVersion || scope.securityEpoch !== context.securityEpoch || scope.purpose !== ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic) return false;
          await authorize(transaction);
          return true;
        }, this.readSecurityConfig, failures);
        try {
          return projectConnectionDiagnosticSnapshot(await new PostgresConnectionDiagnosticRepository(database, this.readSecurityConfig, verification, failures).verify({ ...input, ledgerId }));
        } catch (error) {
          if (error instanceof MessagingSecretAccessError) throw new AdmissionOperationError(error.code, { cause: error });
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof AdmissionOperationError) {
        const ownCode = Object.values(MESSAGING_ERROR_CODE).find((code) => code === error.code) ?? MESSAGING_ERROR_CODE.unexpectedFailure;
        throw new MessagingDiagnosticOperationError(ownCode, { cause: error, ...(error.code === ADMISSION_ERROR_CODE.operationUnresolved && error.operationId ? { operationId: error.operationId } : {}) });
      }
      throw new MessagingDiagnosticOperationError(MESSAGING_ERROR_CODE.unexpectedFailure, { cause: error });
    }
  }
}
