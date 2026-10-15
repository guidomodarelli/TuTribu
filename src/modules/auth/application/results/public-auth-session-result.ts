/** Defines the application's browser session metadata without native auth tokens. @module public-auth-session-result */
import { z } from "zod";
import { PUBLIC_AUTH_SESSION_DIAGNOSTIC, PUBLIC_AUTH_SESSION_FAILURE_MESSAGE } from "../../constants/public-auth-session";

/** Retains readable session metadata for the current account, without its bearer/cookie material. */
export type PublicAuthSessionMetadata = { id: string; userId: string; expiresAt: string; createdAt: string; updatedAt: string; ipAddress: string | null; userAgent: string | null };
/** Own account data already displayed by the authenticated client. */
export type PublicAuthUser = { id: string; name: string; email: string; emailVerified: boolean; image: string | null; createdAt: string; updatedAt: string };
/** Preserves the SDK's current/null result distinction through a safe own public DTO. */
export type PublicAuthSessionResult = { session: PublicAuthSessionMetadata; user: PublicAuthUser } | null;
/** Keeps native successful sign-in metadata and redirects while omitting its session-token field. */
export type PublicAuthSignInResult = { user: PublicAuthUser; redirect?: boolean; url?: string; status?: boolean };

/** Guards only selected own output fields; never a provider response or database row. */
export const publicAuthSessionMetadataSchema: z.ZodType<PublicAuthSessionMetadata> = z.strictObject({ id: z.string().min(1), userId: z.string().min(1), expiresAt: z.iso.datetime(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), ipAddress: z.string().nullable(), userAgent: z.string().nullable() });
/** Guards selected account output without carrying provider credentials or profile payloads. */
export const publicAuthUserSchema: z.ZodType<PublicAuthUser> = z.strictObject({ id: z.string().min(1), name: z.string(), email: z.string().min(1), emailVerified: z.boolean(), image: z.string().nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
/** Validates the minimized own HTTP contract after mapping, including an unauthenticated null. */
export const publicAuthSessionResultSchema: z.ZodType<PublicAuthSessionResult> = z.strictObject({ session: publicAuthSessionMetadataSchema, user: publicAuthUserSchema }).nullable();
/** Guards the own selected sign-in result after the native SDK has already authenticated and set cookies. */
export const publicAuthSignInResultSchema: z.ZodType<PublicAuthSignInResult> = z.strictObject({ user: publicAuthUserSchema, redirect: z.boolean().optional(), url: z.string().optional(), status: z.boolean().optional() });
/** Ensures even a controlled projection failure exposes only fixed copy and safe correlation. */
export const publicAuthSessionFailureSchema = z.strictObject({ code: z.literal(PUBLIC_AUTH_SESSION_DIAGNOSTIC.code), message: z.literal(PUBLIC_AUTH_SESSION_FAILURE_MESSAGE), requestId: z.string().min(1) });
