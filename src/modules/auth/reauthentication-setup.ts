/** Composes reauthentication against current private account facts and owned guarded resources. */
import "server-only";
import {CreateReauthenticationIntentUseCase,ReadReauthenticationIntentUseCase,BeginGlobalReauthenticationUseCase} from "@/src/modules/auth/application/use-cases/recent-authentication-use-cases";
import {createRequestAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/composition/authenticated-account-provider";
import {PostgresRecentAuthenticationRepository} from "@/src/modules/auth/infrastructure/repositories/postgres-recent-authentication-repository";
import {PostgresReauthenticationResourceAuthorizer} from "@/src/modules/auth/infrastructure/repositories/postgres-reauthentication-resource-authorizer";
import {createServerDatabaseClient} from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Resolves global auth once for the request and revalidates every write under SQL locks.
 * @returns Only implemented intent create/read use cases and private writer composition.
 */
export async function createRequestReauthenticationModule() {
  const account=await createRequestAuthenticatedAccountProvider().getAuthenticatedAccount();
  const accounts={getAuthenticatedAccount:async()=>account};
  const database=await createServerDatabaseClient();
  const intents=new PostgresRecentAuthenticationRepository((run)=>database.withRequestContext({userId:account?.userId??null,email:account?.normalizedEmail??null},run),(transaction)=>new PostgresReauthenticationResourceAuthorizer(transaction));
  return {useCases:{createIntent:new CreateReauthenticationIntentUseCase(accounts,intents),readIntent:new ReadReauthenticationIntentUseCase(accounts,intents,()=>new Date()),beginIntent:new BeginGlobalReauthenticationUseCase(accounts,intents)},accounts,intents};
}

/**
 * Resolves the native OAuth state's opaque reference using current server account and resource facts.
 * @param intentId - Own UUID already validated by the SDK decorator boundary.
 * @returns A nonce exclusively for OAuth, or a closed outcome without a fallback.
 */
export async function authorizeGlobalReauthenticationIntent(intentId:string) {
  return (await createRequestReauthenticationModule()).useCases.beginIntent.execute({intentId});
}
