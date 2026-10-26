/** Projects the current account on a pooled request client as one standalone statement. @module pooled-account-provider */
import "server-only";
import type {PostgresAuthenticatedAccountProvider,CurrentGlobalSessionIdentity} from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import type {createPostgresDatabaseClient} from "@/src/modules/shared/infrastructure/database/server-database-client";
import { createRequestAccountProvider } from "./request-account-provider";

/** Pooled request client the projection runs on. */
type AccountProjectionClient=Pick<ReturnType<typeof createPostgresDatabaseClient>,"withStandaloneStatement">;

/**
 * Projects the current account on a pooled client, once per read, as one standalone statement: `read_authenticated_account`
 * sets the request actor for its own implicit transaction and restores it, so the projection costs one round trip instead of
 * a guarded transaction of four, under the same RLS policies.
 * @param readIdentity - The incoming request's authenticated cookie identity.
 * @param openClient - Pooled request client, opened only when a projection runs.
 * @returns A request-time provider; no mutable identity is retained at module scope.
 */
export function createPooledAccountProvider(readIdentity:()=>Promise<CurrentGlobalSessionIdentity|null>,openClient:()=>Promise<AccountProjectionClient>):PostgresAuthenticatedAccountProvider {
  return createRequestAccountProvider(readIdentity,async(_identity,run)=>{
    const database=await openClient();
    return database.withStandaloneStatement(run);
  },{standalone:true});
}
