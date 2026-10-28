/** Authenticates the fixed native workload before invoking any database adapter. */
import { createHash, timingSafeEqual } from "node:crypto";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { ADMISSION_NODE_HOST, ADMISSION_NODE_RUN_STATE, admissionNodeConfigurationSchema, admissionNodeStatusSchema, type AdmissionNodeConfiguration, type AdmissionNodeStatus } from "./constants/admission-node-host";

/** Own host boundary; production libraries are exercised by its concrete adapter. */
export type AdmissionNodeHostDependencies = {
  currentBranchName: () => string | undefined;
  readStatus: () => Promise<AdmissionNodeStatus>;
  run: () => Promise<AdmissionNodeStatus>;
  reportFailure: (error: unknown) => void;
  failureCode?: (error: unknown) => string;
};

/** @param state - Validated run state. @returns The HTTP status that reports it: failures as server errors and unfinished runs as accepted. */
function statusForRunState(state: AdmissionNodeStatus["state"]): number {
  if (state === ADMISSION_NODE_RUN_STATE.failed) return HTTP_STATUS.serverError;
  return state === ADMISSION_NODE_RUN_STATE.running || state === ADMISSION_NODE_RUN_STATE.prepared ? HTTP_STATUS.accepted : HTTP_STATUS.ok;
}

/** @param mappedCode - Code returned by the owner-supplied mapper. @returns It when it is a safe public code, or the fixed unknown code. */
function safeFailureCode(mappedCode: unknown): string {
  return typeof mappedCode === "string" && ADMISSION_NODE_HOST.failureCodePattern.test(mappedCode) ? mappedCode : ADMISSION_NODE_HOST.unknownFailureCode;
}

/**
 * Creates an authenticated branch-pinned handler for one owner-selected operation.
 * @param input - Public deployment metadata and the hash of a private random capability.
 * @param dependencies - Real runtime execution and observation behind an own boundary.
 * @returns A web-standard Node handler; anonymous callers never reach its adapters.
 */
export function createAdmissionNodeHostHandler(input: AdmissionNodeConfiguration, dependencies: AdmissionNodeHostDependencies) {
  const configuration = admissionNodeConfigurationSchema.parse(input);
  const expected = Buffer.from(configuration.tokenSha256, "hex");
  return {
    async fetch(request: Request): Promise<Response> {
      const authorization = request.headers.get("authorization");
      const token = authorization?.startsWith(ADMISSION_NODE_HOST.tokenPrefix) ? authorization.slice(ADMISSION_NODE_HOST.tokenPrefix.length) : null;
      if (token?.length !== ADMISSION_NODE_HOST.tokenCharacters || Date.now() >= configuration.expiresAt || !timingSafeEqual(createHash("sha256").update(token).digest(), expected)) return Response.json({ message: "No autorizado." }, { status: HTTP_STATUS.unauthorized });
      if (dependencies.currentBranchName() !== configuration.branchName) return Response.json({ message: "El entorno de ensayo no coincide." }, { status: HTTP_STATUS.forbidden });
      const path = new URL(request.url).pathname;
      if (!(request.method === "POST" && path === ADMISSION_NODE_HOST.runPath || request.method === "GET" && path === ADMISSION_NODE_HOST.statusPath)) return Response.json({ message: "Ruta de ensayo no disponible." }, { status: HTTP_STATUS.notFound });
      if (request.body) {
        const reader = request.body.getReader();
        try { const first = await reader.read(); if (!first.done && first.value.byteLength) return Response.json({ message: "El ensayo no acepta datos de cuenta enviados por el cliente." }, { status: HTTP_STATUS.badRequest }); }
        finally { await reader.cancel(); }
      }
      try {
        const result = admissionNodeStatusSchema.parse(await (path === ADMISSION_NODE_HOST.runPath ? dependencies.run() : dependencies.readStatus()));
        if (result.operationId !== configuration.operationId) throw new Error("AdmissionNodeHost.response failed: operation_scope_mismatch");
        return Response.json(result, { status: statusForRunState(result.state) });
      } catch (error) {
        dependencies.reportFailure(error);
        const mappedCode = dependencies.failureCode?.(error);
        const code = dependencies.failureCode ? safeFailureCode(mappedCode) : undefined;
        return Response.json({ operationId: configuration.operationId, message: "No pudimos completar el ensayo.", ...(code ? { code } : {}) }, { status: HTTP_STATUS.serverError });
      }
    },
  };
}
