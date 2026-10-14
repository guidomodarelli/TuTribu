/**
 * Creates and deletes the disposable Neon branch that backs the authenticated
 * UI scenarios of `pnpm test:ui`, through the Neon REST API.
 *
 * The branch copies the default branch (copy-on-write), lives only for one run
 * and is deleted by the runner afterwards. Credentials come from the developer
 * environment (`NEON_API_KEY`, `NEON_PROJECT_ID`) and are never printed.
 *
 * @module neon-test-branch
 */

const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";
const NEON_ENDPOINT_TYPE = "read_write";
const NEON_OPERATION_STATUS = {
  failed: "failed",
  finished: "finished",
  cancelled: "cancelled",
  skipped: "skipped",
};
const OPERATION_POLL_INTERVAL_MS = 1000;
const OPERATION_TIMEOUT_MS = 120_000;

/**
 * Wraps a Neon API failure with the operation and HTTP status, never the body
 * of the request (it may carry connection details).
 */
class NeonTestBranchError extends Error {
  /**
   * @param {string} operation - Operation that failed.
   * @param {string} detail - Safe, non-secret detail.
   * @param {unknown} [cause] - Original error.
   */
  constructor(operation, detail, cause) {
    super(`neon-test-branch:${operation} failed: ${detail}`, { cause });
    this.name = "NeonTestBranchError";
  }
}

/**
 * Calls the Neon API and returns the parsed JSON body.
 *
 * @param {{ apiKey: string, method: string, path: string, body?: unknown, operation: string }} request
 * @returns {Promise<any>} Parsed response.
 */
async function callNeonApi({ apiKey, method, path, body, operation }) {
  const response = await fetch(`${NEON_API_BASE_URL}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method,
  });

  if (!response.ok) {
    throw new NeonTestBranchError(operation, `${method} ${path} -> HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Waits until every Neon operation started by the branch creation finishes.
 *
 * @param {{ apiKey: string, projectId: string, operationIds: string[] }} input
 */
async function waitForOperations({ apiKey, projectId, operationIds }) {
  const deadline = Date.now() + OPERATION_TIMEOUT_MS;
  const pending = new Set(operationIds);

  while (pending.size > 0) {
    if (Date.now() > deadline) {
      throw new NeonTestBranchError("waitForOperations", `timeout after ${OPERATION_TIMEOUT_MS} ms`);
    }

    for (const operationId of [...pending]) {
      const { operation } = await callNeonApi({
        apiKey,
        method: "GET",
        operation: "waitForOperations",
        path: `/projects/${projectId}/operations/${operationId}`,
      });

      if (operation.status === NEON_OPERATION_STATUS.finished || operation.status === NEON_OPERATION_STATUS.skipped) {
        pending.delete(operationId);
      } else if (operation.status === NEON_OPERATION_STATUS.failed || operation.status === NEON_OPERATION_STATUS.cancelled) {
        throw new NeonTestBranchError("waitForOperations", `operation ${operationId} ended as ${operation.status}`);
      }
    }

    if (pending.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_INTERVAL_MS));
    }
  }
}

/**
 * Creates a disposable branch of the default branch with a read-write compute.
 *
 * @param {{ apiKey: string, projectId: string, branchName: string }} input
 * @returns {Promise<{ branchId: string, connectionString: string }>} Branch id and owner connection string.
 */
export async function createNeonTestBranch({ apiKey, projectId, branchName }) {
  const created = await callNeonApi({
    apiKey,
    body: { branch: { name: branchName }, endpoints: [{ type: NEON_ENDPOINT_TYPE }] },
    method: "POST",
    operation: "createNeonTestBranch",
    path: `/projects/${projectId}/branches`,
  });
  const branchId = created.branch?.id;
  const connectionString = created.connection_uris?.[0]?.connection_uri;

  if (!branchId || !connectionString) {
    if (branchId) {
      await deleteNeonTestBranch({ apiKey, branchId, projectId });
    }
    throw new NeonTestBranchError("createNeonTestBranch", "response without branch id or connection uri");
  }

  try {
    await waitForOperations({
      apiKey,
      operationIds: (created.operations ?? []).map((operation) => operation.id),
      projectId,
    });
  } catch (error) {
    await deleteNeonTestBranch({ apiKey, branchId, projectId });
    throw error;
  }

  return { branchId, connectionString };
}

/**
 * Deletes a branch created by {@link createNeonTestBranch}.
 *
 * @param {{ apiKey: string, projectId: string, branchId: string }} input
 */
export async function deleteNeonTestBranch({ apiKey, projectId, branchId }) {
  await callNeonApi({
    apiKey,
    method: "DELETE",
    operation: "deleteNeonTestBranch",
    path: `/projects/${projectId}/branches/${branchId}`,
  });
}
