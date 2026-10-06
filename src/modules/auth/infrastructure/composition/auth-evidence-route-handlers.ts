/** Composes the existing global auth handlers with guarded minimal identity persistence. */
import "server-only";
import {toNextJsHandler} from "better-auth/next-js";
import {AUTH_EVIDENCE_CAPTURE_LOG} from "@/src/modules/auth/constants/auth-evidence-capture";
import {createScopedAuthEvidenceHandler,type AuthEvidenceFailureDiagnostic} from "@/src/modules/auth/infrastructure/better-auth/scoped-auth-evidence-handler";
import type {CompletedGoogleLogin} from "@/src/modules/auth/infrastructure/better-auth/auth-evidence-context";
import {persistCompletedGlobalAuthentication} from "@/src/modules/auth/infrastructure/composition/complete-global-authentication";
import {createServerDatabaseClient} from "@/src/modules/shared/infrastructure/database/server-database-client";
import {createServerLogger} from "@/src/modules/shared/infrastructure/observability/server-logger";

/**
 * Persists only the native completion using the current request database composition.
 * @param completion - Verified identity bound to the account/session created by global auth.
 * @returns Stored identity or a mismatch closed by the repository's current facts.
 */
async function persistCompletedIdentity(completion:CompletedGoogleLogin):Promise<{status:"stored"|"identity_mismatch"}> {
  const database=await createServerDatabaseClient();
  return database.withRequestContext({userId:completion.userId,email:completion.evidence.normalizedEmail},(transaction)=>persistCompletedGlobalAuthentication(transaction,completion));
}

/**
 * Reports capture failure without exposing SDK errors, SQL values or profile data.
 * @param failure - Safe operation outcome and correlation from the request boundary.
 * @returns Nothing after recording the closed additional-evidence outcome.
 */
function reportCaptureFailure(failure:AuthEvidenceFailureDiagnostic):void {
  createServerLogger({feature:AUTH_EVIDENCE_CAPTURE_LOG.feature,operation:AUTH_EVIDENCE_CAPTURE_LOG.operation,requestId:failure.requestId,traceId:failure.traceId}).error({message:AUTH_EVIDENCE_CAPTURE_LOG.failureMessage,metadata:{code:failure.code,failureKind:failure.failureKind}});
}

/**
 * Composes framework wiring around the existing Better Auth instance.
 * @param auth - Native global auth instance already configured by the owning module.
 * @returns GET/POST handlers with request-local capture and the original HTTP response.
 */
export function buildAuthEvidenceRouteHandlers(auth:Parameters<typeof toNextJsHandler>[0]) {
  const native=toNextJsHandler(auth);
  const observers={persist:persistCompletedIdentity,reportFailure:reportCaptureFailure};
  return {GET:createScopedAuthEvidenceHandler(native.GET,observers),POST:createScopedAuthEvidenceHandler(native.POST,observers)};
}
