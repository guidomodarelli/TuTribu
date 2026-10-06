/** Keeps private Google captures local to the global auth request that produced them. */
import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import type {GoogleIdentityEvidenceVerificationResult} from "./google-id-token-evidence-verifier";

/** Transient minimal capture; it contains neither the ID token nor the provider profile. */
export type AuthEvidenceContext={googleEvidence:GoogleIdentityEvidenceVerificationResult|null};

/** Own immutable context manager; individual request stores never escape their run. */
const authEvidenceStorage=new AsyncLocalStorage<AuthEvidenceContext>();

/**
 * Runs the existing global auth handler inside a fresh private capture scope.
 * @param callback - Existing handler operation, preserving its response and errors.
 * @returns The original callback's result, including its asynchronous lifetime.
 */
export function runWithAuthEvidenceContext<Result>(callback:()=>Result):Result {
  return authEvidenceStorage.run({googleEvidence:null},callback);
}

/**
 * Reads only the current auth request's capture store, without a global fallback.
 * @returns The active store or undefined outside an explicitly scoped handler.
 */
export function getAuthEvidenceContext():AuthEvidenceContext|undefined {
  return authEvidenceStorage.getStore();
}
