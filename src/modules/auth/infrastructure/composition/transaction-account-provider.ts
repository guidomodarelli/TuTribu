/** Binds current account reads to an existing protected feature transaction. @module transaction-account-provider */
import "server-only";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";

/** Each callback uses the current server-derived actor and the existing pool guard. */
export type FeatureAccountDatabaseExecutor = <Result>(account: AuthenticatedAccount, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Request modules retain providers/executors only, never a mutable account or global credential client. */
export type AuthenticatedFeatureDependencies = { accounts: AuthenticatedAccountProvider; execute: FeatureAccountDatabaseExecutor; clock: () => Date };

/**
 * Rereads current SQL account/session/binding facts without acquiring another checkout inside a transaction.
 * @param database - Existing protected transaction whose SQL actor must match the account.
 * @param account - Identity resolved by the trusted current-session provider before entering the transaction.
 * @returns A provider that queries current facts on every call rather than replaying the supplied snapshot.
 */
export function createTransactionAccountProvider(database: RequestDatabase, account: AuthenticatedAccount): AuthenticatedAccountProvider {
  return new PostgresAuthenticatedAccountProvider(async () => ({ userId: account.userId, sessionId: account.session.id }), (_identity, run) => run(database));
}
