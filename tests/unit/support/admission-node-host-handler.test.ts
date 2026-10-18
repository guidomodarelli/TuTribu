/** @vitest-environment node */
/** Verifies authentication and scoped host dispatch through own ports with real crypto and HTTP objects. */
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionNodeHostHandler } from "@/tests/support/admission-node-host-handler";
import { ADMISSION_NODE_HOST, ADMISSION_NODE_RUN_STATE, type AdmissionNodeStatus } from "@/tests/support/constants/admission-node-host";
import { HTTP_STATUS } from "@/src/constants/http-status";

/** @returns A scoped own-port fixture; these unit outcomes are never performance evidence. */
function prepareHandler() {
  const token = randomBytes(ADMISSION_NODE_HOST.tokenBytes).toString("base64url"), operationId = randomUUID();
  const configuration = { branchName: "synthetic-node-branch", operationId, tokenSha256: createHash("sha256").update(token).digest("hex"), expiresAt: Date.now() + ADMISSION_NODE_HOST.capabilityLifetimeMs, sourceCommit: "a".repeat(40), bundleSha256: "b".repeat(64) };
  const prepared: AdmissionNodeStatus = { operationId, state: ADMISSION_NODE_RUN_STATE.prepared, measurement: null };
  const dependencies = { currentBranchName: () => configuration.branchName, readStatus: vi.fn().mockResolvedValue(prepared), run: vi.fn().mockResolvedValue(prepared), reportFailure: vi.fn() };
  const request = (path: string = ADMISSION_NODE_HOST.runPath, method = "POST", credential: string | null = token, body?: string) => new Request(`https://native-probe.example.invalid${path}`, { method, ...(credential ? { headers: { authorization: `${ADMISSION_NODE_HOST.tokenPrefix}${credential}` } } : {}), ...(body !== undefined ? { body } : {}) });
  return { configuration, dependencies, token, request, prepared };
}

describe("native Node workload boundary", () => {
  it.each([null, "invalid-capability"])("should reject %s before any database dependency", async (credential) => {
    const fixture = prepareHandler(), handler = createAdmissionNodeHostHandler(fixture.configuration, fixture.dependencies);
    expect((await handler.fetch(fixture.request(ADMISSION_NODE_HOST.runPath, "POST", credential))).status).toBe(HTTP_STATUS.unauthorized);
    expect(fixture.dependencies.run).not.toHaveBeenCalled(); expect(fixture.dependencies.readStatus).not.toHaveBeenCalled();
  });
  it("should reject an expired capability without querying", async () => {
    const fixture = prepareHandler(), handler = createAdmissionNodeHostHandler({ ...fixture.configuration, expiresAt: Date.now() - 1 }, fixture.dependencies);
    expect((await handler.fetch(fixture.request())).status).toBe(HTTP_STATUS.unauthorized);
    expect(fixture.dependencies.run).not.toHaveBeenCalled();
  });
  it("should reject a different branch before accessing stored work", async () => {
    const fixture = prepareHandler(), handler = createAdmissionNodeHostHandler(fixture.configuration, { ...fixture.dependencies, currentBranchName: () => "another-branch" });
    expect((await handler.fetch(fixture.request())).status).toBe(HTTP_STATUS.forbidden);
    expect(fixture.dependencies.run).not.toHaveBeenCalled(); expect(fixture.dependencies.readStatus).not.toHaveBeenCalled();
  });
  it("should observe the original independently without starting another workload", async () => {
    const fixture = prepareHandler(), handler = createAdmissionNodeHostHandler(fixture.configuration, fixture.dependencies);
    const response = await handler.fetch(fixture.request(ADMISSION_NODE_HOST.statusPath, "GET"));
    expect(response.status).toBe(HTTP_STATUS.accepted); expect(await response.json()).toEqual(fixture.prepared);
    expect(fixture.dependencies.readStatus).toHaveBeenCalledTimes(1); expect(fixture.dependencies.run).not.toHaveBeenCalled();
  });
  it("should reject account input even for the authorized caller", async () => {
    const fixture = prepareHandler(), handler = createAdmissionNodeHostHandler(fixture.configuration, fixture.dependencies);
    expect((await handler.fetch(fixture.request(ADMISSION_NODE_HOST.runPath, "POST", fixture.token, JSON.stringify({ userId: randomUUID(), role: "leader" })))).status).toBe(HTTP_STATUS.badRequest);
    expect(fixture.dependencies.run).not.toHaveBeenCalled();
  });
  it("should reject a response for another operation and keep the private error off the wire", async () => {
    const fixture = prepareHandler(); fixture.dependencies.run.mockResolvedValue({ ...fixture.prepared, operationId: randomUUID() });
    const handler = createAdmissionNodeHostHandler(fixture.configuration, fixture.dependencies), response = await handler.fetch(fixture.request());
    expect(response.status).toBe(HTTP_STATUS.serverError); expect(await response.json()).toEqual({ operationId: fixture.configuration.operationId, message: "No pudimos completar el ensayo." });
    expect(fixture.dependencies.reportFailure).toHaveBeenCalledTimes(1);
  });
  it("should require complete deployment metadata instead of falling back to another environment", () => {
    const fixture = prepareHandler();
    expect(() => createAdmissionNodeHostHandler({ ...fixture.configuration, tokenSha256: "" }, fixture.dependencies)).toThrow();
  });
});
