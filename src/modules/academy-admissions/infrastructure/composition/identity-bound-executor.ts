/** Rechecks the native account and session before every protected admission checkout. @module identity-bound-executor */
import "server-only";
import type { AuthenticatedFeatureDependencies } from "@/src/modules/auth/infrastructure/composition/transaction-account-provider";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** @param dependencies - Native current-account provider and protected executor owned by this request. @returns A guarded executor that rechecks the native account/session on every checkout; no account snapshot is retained. */
export function createIdentityBoundExecutor(dependencies: AuthenticatedFeatureDependencies) {
  /** @param scope - Server-resolved account/session being rechecked before checkout. @param run - DB-only work. @returns The guarded result. @throws AdmissionOperationError when the native account or session changed. */
  return async <Result>(scope: { userId: string; sessionId: string }, run: (database: RequestDatabase) => Promise<Result>): Promise<Result> => {
    const account = await dependencies.accounts.getAuthenticatedAccount();
    if (account?.userId !== scope.userId || account.session.id !== scope.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    return dependencies.execute(account, run);
  };
}
