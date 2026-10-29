/** Runs one local connection lifecycle action through the original private ledger and closes its failures to messaging codes. @module messaging-connection-lifecycle-ledger */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingConnectionLifecycleContext } from "../../domain/repositories/messaging-connection-lifecycle";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import { messagingConnectionLifecycleResultSchema } from "../../application/results/messaging-connection-lifecycle-result";
import type { AdmissionOperationCommand } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MessagingConnectionOperationError } from "../../domain/errors/messaging-connection-operation-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { executeMessagingLedger } from "./execute-messaging-ledger";

/** Own actor executor commits each original ledger/effect phase separately. */
export type MessagingConnectionLifecycleExecutor=<Result>(context:MessagingConnectionLifecycleContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;

/** One lifecycle action: the actor executor, MAC keys, exact scope, original operation identity and intent, the current resource authorization and the protected effect. */
type MessagingConnectionLifecycleRun = {
  execute: MessagingConnectionLifecycleExecutor;
  readSecurityConfig: () => Promise<MessagingSecurityConfig>;
  context: MessagingConnectionLifecycleContext;
  operationType: string;
  operationId: string;
  intent: AdmissionOperationCommand["intent"];
  authorize: (database: RequestDatabase) => Promise<unknown>;
  effect: (database: RequestDatabase, ledgerId: string) => Promise<unknown>;
};

/**
 * @param action - Lifecycle action to run once through the ledger.
 * @returns Original local commit or registered progress.
 * @throws MessagingConnectionOperationError with a closed messaging code; an unresolved original keeps its own operation id.
 */
export async function runMessagingConnectionLifecycle(action: MessagingConnectionLifecycleRun) {
  const { context } = action;
  const command = { actorUserId: context.actorUserId, tribeId: context.tribeId, operationType: action.operationType, idempotencyKey: action.operationId, intent: action.intent };
  const ledger = new PostgresAdmissionOperationRepository((run) => executeMessagingLedger(() => action.execute(context, run)), async (database) => { await action.authorize(database); return true; }, action.readSecurityConfig);
  try { return await ledger.run(command, messagingConnectionLifecycleResultSchema, action.effect); }
  catch (error) {
    const code = error instanceof AdmissionOperationError ? Object.values(MESSAGING_ERROR_CODE).find((candidate) => candidate === error.code) ?? MESSAGING_ERROR_CODE.unexpectedFailure : MESSAGING_ERROR_CODE.unexpectedFailure;
    throw new MessagingConnectionOperationError(code, { cause: error, ...(error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.operationUnresolved && error.operationId === action.operationId ? { operationId: action.operationId } : {}) });
  }
}
