/** Maps native auth session output to own private HTTP DTOs without changing cookies or auth decisions. @module public-auth-session-response */
import "server-only";
import type { Session, User } from "better-auth";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { PRIVATE_RESPONSE_HEADERS } from "@/src/modules/shared/constants/private-http";
import { attachRequestContextToResponse, type RequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { PUBLIC_AUTH_SESSION_ENDPOINT, PUBLIC_AUTH_SESSION_PATH_SEPARATOR, PUBLIC_AUTH_SESSION_DIAGNOSTIC, PUBLIC_AUTH_SESSION_FAILURE_MESSAGE, PUBLIC_AUTH_SESSION_REPLACED_HEADERS } from "../../constants/public-auth-session";
import { publicAuthSessionResultSchema, publicAuthSessionMetadataSchema, publicAuthSessionFailureSchema, publicAuthSignInResultSchema, type PublicAuthSessionMetadata, type PublicAuthUser } from "../../application/results/public-auth-session-result";

/** @param value - Native SDK time, serialized by its HTTP handler. @returns The own DTO's ISO field without changing the original instant. */
function serializedTime(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
/** @param session - Trusted native session contract, never input or a public command. @returns Selected readable metadata; token and extra fields are never copied. */
function publicSession(session: Session): PublicAuthSessionMetadata {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: serializedTime(session.expiresAt),
    createdAt: serializedTime(session.createdAt),
    updatedAt: serializedTime(session.updatedAt),
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
  };
}
/** @param user - Native account contract. @returns Only the current user's existing displayed metadata. */
function publicUser(user: User): PublicAuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image ?? null,
    createdAt: serializedTime(user.createdAt),
    updatedAt: serializedTime(user.updatedAt),
  };
}

/** @param request - Native routing. @returns Its decoded path without trailing separators, or empty when it cannot be decoded. */
function requestPath(request: Request): string {
  try {
    const path = decodeURIComponent(new URL(request.url).pathname);
    let end = path.length;
    while (end > 0 && path[end - 1] === PUBLIC_AUTH_SESSION_PATH_SEPARATOR) end -= 1;
    return path.slice(0, end);
  } catch {
    return "";
  }
}

/** @param body - Parsed native success body. @param endpoint - Whether it answers the current-session or session-list endpoint; otherwise it is a sign-in. @returns The allowlisted own DTO. @throws When the native body does not fit the own contract. */
function projectNativeBody(body: unknown, { current, list }: { current: boolean; list: boolean }): unknown {
  if (current) {
    const native = body as { session: Session; user: User };
    return publicAuthSessionResultSchema.parse(body === null ? null : {
      session: publicSession(native.session), user: publicUser(native.user),
    });
  }
  if (list) return publicAuthSessionMetadataSchema.array().parse((body as Session[]).map(publicSession));
  const native = body as { user: User; redirect?: boolean; url?: string; status?: boolean };
  return publicAuthSignInResultSchema.parse({
    user: publicUser(native.user),
    ...(Object.hasOwn(native, "redirect") ? { redirect: native.redirect } : {}),
    ...(Object.hasOwn(native, "url") ? { url: native.url } : {}),
    ...(Object.hasOwn(native, "status") ? { status: native.status } : {}),
  });
}

/**
 * Applies private HTTP semantics and selects session/sign-in successes without native token fields.
 * @param request - Native routing, never the source of account or session authority.
 * @param response - Original provider result after its own authorization and cookie updates.
 * @param context - Current safe correlation selected by the owning request wrapper.
 * @returns Original statuses, redirects and cookies; session success has an allowlisted own DTO.
 * @remarks Native errors are preserved. Mapping failure is a controlled 500, never a false null/expiry.
 */
export async function projectPublicAuthResponse(request: Request, response: Response, context: RequestContext): Promise<Response> {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) headers.set(name, value);
  const wrap = (result: Response) => attachRequestContextToResponse(result, context);
  const path = requestPath(request);
  const current = path.endsWith(PUBLIC_AUTH_SESSION_ENDPOINT.current);
  const list = path.endsWith(PUBLIC_AUTH_SESSION_ENDPOINT.list);
  if (!response.ok || (!current && !list && !headers.get("content-type")?.includes("application/json"))) {
    return wrap(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
  }
  try {
    const body: unknown = await response.clone().json();
    const signIn = body !== null && typeof body === "object" && !Array.isArray(body) && Object.hasOwn(body, "token");
    if (!current && !list && !signIn) {
      return wrap(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
    }
    for (const name of PUBLIC_AUTH_SESSION_REPLACED_HEADERS) headers.delete(name);
    const projection = projectNativeBody(body, { current, list });
    return wrap(Response.json(projection, { status: response.status, headers }));
  } catch {
    for (const name of PUBLIC_AUTH_SESSION_REPLACED_HEADERS) headers.delete(name);
    createServerLogger({
      feature: PUBLIC_AUTH_SESSION_DIAGNOSTIC.feature,
      operation: PUBLIC_AUTH_SESSION_DIAGNOSTIC.operation,
      ...context,
    }).error({ message: PUBLIC_AUTH_SESSION_DIAGNOSTIC.message, metadata: { code: PUBLIC_AUTH_SESSION_DIAGNOSTIC.code } });
    return wrap(Response.json(publicAuthSessionFailureSchema.parse({
      code: PUBLIC_AUTH_SESSION_DIAGNOSTIC.code,
      message: PUBLIC_AUTH_SESSION_FAILURE_MESSAGE,
      requestId: context.requestId,
    }), { status: HTTP_STATUS.serverError, headers }));
  }
}
