/**
 * Minimal Neon REST API client shared by the local tooling that manages
 * disposable branches (`pnpm test:ui` and `pnpm db:sandbox`).
 *
 * The API key comes from the developer environment and is only sent in the
 * `Authorization` header. Errors carry the operation, method, path and HTTP
 * status, never request or response bodies, which may hold connection details.
 *
 * @module neon-api-client
 */

const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";
const NEON_OPERATION_STATUS = {
  cancelled: "cancelled",
  failed: "failed",
  finished: "finished",
  skipped: "skipped",
};
const OPERATION_POLL_INTERVAL_MS = 1000;
const OPERATION_TIMEOUT_MS = 120_000;
const HTTP_STATUS_NO_CONTENT = 204;

/** Wraps a Neon API failure with safe, non-secret context. */
export class NeonApiError extends Error {
  /**
   * @param {string} operation - Operation that failed, prefixed by its caller.
   * @param {string} detail - Safe, non-secret detail.
   * @param {unknown} [cause] - Original error.
   */
  constructor(operation, detail, cause) {
    super(`${operation} failed: ${detail}`, { cause });
    this.name = "NeonApiError";
  }
}

/**
 * Calls the Neon API and returns the parsed JSON body, or `{}` when a
 * successful response has no body.
 *
 * @param {{ apiKey: string, method: string, path: string, body?: unknown, operation: string }} request
 * @returns {Promise<any>} Parsed response.
 */
export async function callNeonApi({ apiKey, method, path, body, operation }) {
  const response = await fetch(`${NEON_API_BASE_URL}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method,
  });

  if (!response.ok) {
    throw new NeonApiError(operation, `${method} ${path} -> HTTP ${response.status}`);
  }

  // A 204 (for example, deleting a branch that is already gone) or an empty body is a success with nothing to parse.
  const responseText = response.status === HTTP_STATUS_NO_CONTENT ? "" : await response.text();

  return responseText ? JSON.parse(responseText) : {};
}

/**
 * Waits until every listed Neon operation finishes.
 *
 * @param {{ apiKey: string, projectId: string, operationIds: string[], operation: string }} input
 */
export async function waitForNeonOperations({ apiKey, projectId, operationIds, operation }) {
  const deadline = Date.now() + OPERATION_TIMEOUT_MS;
  const pending = new Set(operationIds);

  while (pending.size > 0) {
    if (Date.now() > deadline) {
      throw new NeonApiError(operation, `timeout after ${OPERATION_TIMEOUT_MS} ms`);
    }

    for (const operationId of pending) {
      const { operation: neonOperation } = await callNeonApi({
        apiKey,
        method: "GET",
        operation,
        path: `/projects/${projectId}/operations/${operationId}`,
      });

      if (
        neonOperation.status === NEON_OPERATION_STATUS.finished ||
        neonOperation.status === NEON_OPERATION_STATUS.skipped
      ) {
        pending.delete(operationId);
      } else if (
        neonOperation.status === NEON_OPERATION_STATUS.failed ||
        neonOperation.status === NEON_OPERATION_STATUS.cancelled
      ) {
        throw new NeonApiError(operation, `operation ${operationId} ended as ${neonOperation.status}`);
      }
    }

    if (pending.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_INTERVAL_MS));
    }
  }
}

/**
 * Extracts the operation ids a Neon mutation response started.
 *
 * @param {{ operations?: { id: string }[] }} response - Neon mutation response.
 * @returns {string[]} Operation ids to wait for.
 */
export function readOperationIds(response) {
  return (response.operations ?? []).map((neonOperation) => neonOperation.id);
}
