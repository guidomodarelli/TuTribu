/**
 * Classifies Better Auth errors raised when a member has no account linked to
 * the requested provider.
 *
 * @module provider-account-errors
 */

import { BASE_ERROR_CODES } from "better-auth";
import { APIError } from "better-auth/api";

/**
 * Tells whether Better Auth rejected a provider token request because the
 * member has no account for that provider, for example a development member
 * that signed in with email and password and never linked Google.
 *
 * @param error - Value thrown by a Better Auth API call.
 * @returns `true` when the provider account does not exist.
 */
export function isMissingProviderAccountError(error: unknown): boolean {
  return (
    error instanceof APIError &&
    error.body?.code === BASE_ERROR_CODES.ACCOUNT_NOT_FOUND.code
  );
}
