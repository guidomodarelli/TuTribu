/** Keeps private Google captures local to the global auth request that produced them. */
import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import type {GoogleIdentityEvidenceVerificationResult} from "./google-id-token-evidence-verifier";
import type {GoogleIdentityEvidenceCandidate} from "@/src/modules/auth/domain/entities/global-identity-evidence";
import type {GlobalIdentityEvidenceScope} from "@/src/modules/auth/domain/repositories/global-identity-evidence-repository";
import type {AUTH_EVIDENCE_CAPTURE_FAILURE,AUTH_EVIDENCE_FAILURE_KIND} from "@/src/modules/auth/constants/auth-evidence-capture";

/** Identifies only the native login that completed with matching signed identity facts. */
export type CompletedGoogleLogin=GlobalIdentityEvidenceScope&{evidence:GoogleIdentityEvidenceCandidate;reauthenticationIntentId:string|null};
/** Contains a safe diagnostic only; the request store never retains a raw SDK failure. */
export type AuthEvidenceCaptureFailure={code:(typeof AUTH_EVIDENCE_CAPTURE_FAILURE)[keyof typeof AUTH_EVIDENCE_CAPTURE_FAILURE];failureKind?:(typeof AUTH_EVIDENCE_FAILURE_KIND)[keyof typeof AUTH_EVIDENCE_FAILURE_KIND]};

/** Transient minimal capture; it contains neither the ID token nor the provider profile. */
export type AuthEvidenceContext={googleEvidence:GoogleIdentityEvidenceVerificationResult|null;completedGoogleLogin:CompletedGoogleLogin|null;captureFailure:AuthEvidenceCaptureFailure|null};

/** Own immutable context manager; individual request stores never escape their run. */
const authEvidenceStorage=new AsyncLocalStorage<AuthEvidenceContext>();

/**
 * Runs the existing global auth handler inside a fresh private capture scope.
 * @param callback - Existing handler operation, preserving its response and errors.
 * @returns The original callback's result, including its asynchronous lifetime.
 */
export function runWithAuthEvidenceContext<Result>(callback:()=>Result):Result {
  return authEvidenceStorage.run({googleEvidence:null,completedGoogleLogin:null,captureFailure:null},callback);
}

/**
 * Reads only the current auth request's capture store, without a global fallback.
 * @returns The active store or undefined outside an explicitly scoped handler.
 */
export function getAuthEvidenceContext():AuthEvidenceContext|undefined {
  return authEvidenceStorage.getStore();
}
