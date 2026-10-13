/** Reuses only cookie identity inside one request while projecting current SQL facts on every read. @module request-account-provider */
import "server-only";
import { PostgresAuthenticatedAccountProvider, type CurrentGlobalSessionIdentity } from "../authenticated-account-provider";

/**
 * Composes one request-owned provider without retaining session tokens or account snapshots.
 * @param readIdentity - The immutable incoming request's authenticated cookie identity.
 * @param execute - Existing guarded SQL executor; called again for every account projection.
 * @returns A provider that coalesces cookie lookup only and still detects revoked/expired sessions in SQL.
 * @remarks Construct a new instance for each request. Never retain this provider at module scope.
 */
export function createRequestAccountProvider(readIdentity: () => Promise<CurrentGlobalSessionIdentity | null>, execute: ConstructorParameters<typeof PostgresAuthenticatedAccountProvider>[1]): PostgresAuthenticatedAccountProvider {
  let identity: Promise<CurrentGlobalSessionIdentity | null> | undefined;
  return new PostgresAuthenticatedAccountProvider(() => identity ??= readIdentity(), execute);
}
