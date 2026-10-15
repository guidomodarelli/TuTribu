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

import { callNeonApi, NeonApiError, readOperationIds, waitForNeonOperations } from "../neon/neon-api-client.mjs";

const NEON_ENDPOINT_TYPE = "read_write";
const OPERATION_PREFIX = "neon-test-branch";

/**
 * Creates a disposable branch of the default branch with a read-write compute.
 *
 * @param {{ apiKey: string, projectId: string, branchName: string }} input
 * @returns {Promise<{ branchId: string, connectionString: string }>} Branch id and owner connection string.
 */
export async function createNeonTestBranch({ apiKey, projectId, branchName }) {
  const operation = `${OPERATION_PREFIX}:createNeonTestBranch`;
  const created = await callNeonApi({
    apiKey,
    body: { branch: { name: branchName }, endpoints: [{ type: NEON_ENDPOINT_TYPE }] },
    method: "POST",
    operation,
    path: `/projects/${projectId}/branches`,
  });
  const branchId = created.branch?.id;
  const connectionString = created.connection_uris?.[0]?.connection_uri;

  if (!branchId || !connectionString) {
    if (branchId) {
      await deleteNeonTestBranch({ apiKey, branchId, projectId });
    }
    throw new NeonApiError(operation, "response without branch id or connection uri");
  }

  try {
    await waitForNeonOperations({
      apiKey,
      operation: `${OPERATION_PREFIX}:waitForOperations`,
      operationIds: readOperationIds(created),
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
    operation: `${OPERATION_PREFIX}:deleteNeonTestBranch`,
    path: `/projects/${projectId}/branches/${branchId}`,
  });
}
