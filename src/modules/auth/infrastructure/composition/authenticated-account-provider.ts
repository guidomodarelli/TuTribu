/** Composes a private account projection from the real session and existing guarded SQL runtime. */
import "server-only";
import {getServerBetterAuthSession} from "@/src/modules/auth/infrastructure/better-auth/server-auth-context";
import type {PostgresAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import {createServerDatabaseClient} from "@/src/modules/shared/infrastructure/database/server-database-client";
import { createPooledAccountProvider } from "./pooled-account-provider";

/**
 * Builds current global account facts without changing session renewal or reading OAuth per render.
 * @returns A request-time provider; no mutable identity is retained at module scope.
 */
export function createRequestAuthenticatedAccountProvider():PostgresAuthenticatedAccountProvider {
  return createPooledAccountProvider(async()=>{
    const session=await getServerBetterAuthSession();
    return session?{userId:session.user.id,sessionId:session.session.id}:null;
  },()=>createServerDatabaseClient());
}
