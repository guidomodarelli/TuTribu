"use client";
/** Uses native global auth and same-origin own usage DTOs without hidden retries. @module messaging-usage-api-client */
import { z } from "zod";
import { createAuthClient } from "better-auth/client";
import type { MessagingUsageBrowserClient, MessagingUsageBrowserResult } from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import { messagingUsagePolicyStateSchema, messagingUsagePolicySchema, messagingPublicErrorSchema } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import { messagingUsageOperationRecoverySchema } from "@/src/modules/messaging/application/results/messaging-usage-operation-result";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_USAGE_BROWSER_PATH } from "@/src/modules/messaging/constants/messaging-usage";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** @param options - Explicit feature-owned transport/viewer ports; defaults retain the real Better Auth SDK. @returns Abortable own reads and immutable original writes, without full route refreshes. */
export function createMessagingUsageBrowserClient(options: { fetch?: typeof fetch; viewer?: MessagingUsageBrowserClient["viewer"] } = {}): MessagingUsageBrowserClient {
  const transport = options.fetch ?? globalThis.fetch, auth = options.viewer ? null : createAuthClient();
  const failure = (code: typeof MESSAGING_ERROR_CODE[keyof typeof MESSAGING_ERROR_CODE], uncertain = false): MessagingUsageBrowserResult<never> => ({ status: "failed", code, message: MESSAGING_ERROR_MESSAGE[code], uncertain });
  const base = (slug: string) => `${MESSAGING_USAGE_BROWSER_PATH.tribePrefix}/${encodeURIComponent(slug)}/${MESSAGING_USAGE_BROWSER_PATH.usageSegment}`;
  /** Only own response DTOs are schema-guarded; transport failure of a write remains uncertain. */
  async function request<Value>(path: string, schema: z.ZodType<Value>, signal: AbortSignal, input?: object, method: "POST" | "PUT" = "POST"): Promise<MessagingUsageBrowserResult<Value>> {
    const writing = input !== undefined;
    if (signal.aborted) return { status: "aborted" };
    try {
      const response = await transport(path, { method: writing ? method : "GET", credentials: "same-origin", cache: "no-store", signal, ...(writing ? { headers: { "content-type": "application/json" }, body: JSON.stringify(input) } : {}) });
      const value: unknown = await response.json();
      if (signal.aborted) return { status: "aborted" };
      const publicFailure = messagingPublicErrorSchema.safeParse(value);
      if (publicFailure.success) return failure(publicFailure.data.code, writing && (response.status >= HTTP_STATUS.serverError || publicFailure.data.operation !== undefined));
      if (!response.ok) return failure(MESSAGING_ERROR_CODE.publicContractUnusable, writing);
      const parsed = schema.safeParse(value);
      return parsed.success ? { status: "ready", value: parsed.data } : failure(MESSAGING_ERROR_CODE.publicContractUnusable, writing);
    } catch { return signal.aborted ? { status: "aborted" } : failure(MESSAGING_ERROR_CODE.dependencyUnavailable, writing); }
  }
  /** Current version is not inferred from an original replay; only its own UUID/counter relationship is confirmed. */
  async function write(slug: string, input: { operationId: string; confirmed: true; expectedVersion?: number }, signal: AbortSignal, method: "POST" | "PUT") {
    const result = await request(base(slug), createAdmissionOperationStateSchema(messagingUsagePolicySchema), signal, input, method);
    if (result.status !== "ready") return result;
    if (result.value.operationId.toLowerCase() !== input.operationId.toLowerCase()) return failure(MESSAGING_ERROR_CODE.publicContractUnusable, true);
    if (result.value.state === OPERATION_STATE.completed && input.expectedVersion !== undefined && result.value.result.version !== input.expectedVersion && result.value.result.version !== input.expectedVersion + 1) return failure(MESSAGING_ERROR_CODE.publicContractUnusable, true);
    return result;
  }
  return {
    read: (slug, signal) => request(base(slug), messagingUsagePolicyStateSchema, signal),
    initialize: (slug, input, signal) => write(slug, input, signal, "POST"),
    update: (slug, input, signal) => write(slug, input, signal, "PUT"),
    async operation(slug, operationId, signal) {
      const result = await request(`${base(slug)}/${MESSAGING_USAGE_BROWSER_PATH.operationsSegment}/${encodeURIComponent(operationId)}`, messagingUsageOperationRecoverySchema, signal);
      return result.status === "ready" && result.value.operationId.toLowerCase() !== operationId.toLowerCase() ? failure(MESSAGING_ERROR_CODE.publicContractUnusable) : result;
    },
    viewer: options.viewer ?? (async (signal) => {
      if (signal.aborted) return { status: "aborted" };
      try {
        const result = await auth!.getSession({ query: { disableCookieCache: true }, fetchOptions: { signal } });
        if (signal.aborted) return { status: "aborted" };
        if (result.error) return result.error.status === HTTP_STATUS.unauthorized ? { status: "ready", value: null } : failure(MESSAGING_ERROR_CODE.dependencyUnavailable);
        return { status: "ready", value: result.data ? { id: result.data.user.id } : null };
      } catch { return signal.aborted ? { status: "aborted" } : failure(MESSAGING_ERROR_CODE.dependencyUnavailable); }
    }),
  };
}
/** Route containers own this transport; presentational components never import it. */
export const messagingUsageBrowserClient = createMessagingUsageBrowserClient();
