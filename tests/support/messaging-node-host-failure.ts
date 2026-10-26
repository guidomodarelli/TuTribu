/** Keeps safe phase diagnostics across private transport and branch-owner wrappers, without serializing payloads. */
import { readPostgresTestDiagnostics } from "./postgres-test-diagnostics";
import { ADMISSION_NODE_HOST } from "./constants/admission-node-host";
import { MESSAGING_NODE_HOST_FAILURE as FAILURE } from "./constants/messaging-node-host-failure";

/** Carries only a validated code; the original private error remains a backend cause. */
export class MessagingNodeHostFailure extends Error {
  readonly code: string;
  /** @param code - Own safe endpoint or assertion label. @param cause - Original private failure, never serialized. */
  constructor(code: string, cause?: unknown) {
    const safeCode = ADMISSION_NODE_HOST.failureCodePattern.test(code) ? code : ADMISSION_NODE_HOST.unknownFailureCode;
    super(`MessagingNodeHostFailure: ${safeCode}`, { cause });
    this.name = FAILURE.errorName;
    this.code = safeCode;
  }
}

/** @param error - Actual native phase failure. @returns A fixed own label or metadata-only fallback, never its raw message. */
export function readMessagingNodePhaseFailureCode(error: unknown): string {
  if (error instanceof Error && error.name === "ZodError") return FAILURE.privateInputInvalid;
  const detail = error instanceof Error ? FAILURE.ownFailurePattern.exec(error.message)?.groups?.detail : undefined;
  if (detail) return detail.toLowerCase();
  const diagnostics = readPostgresTestDiagnostics(error);
  if (diagnostics.sqlStates.length) return `postgres_${diagnostics.sqlStates[0].toLowerCase()}`;
  return FAILURE.phaseFailed;
}

/** @param error - An untrusted backend error. @returns A known classification only, never an arbitrary name. */
function safeName(error: Error): string {
  return FAILURE.safeNames.includes(error.name) ? error.name : FAILURE.unknownName;
}

/** @param error - Nested private owner/transport error. @returns Safe typed causes, preferring the actual phase over an outer resource wrapper. */
export function summarizeMessagingNodeHostFailure(error: unknown): { name: string; code: string | null; causes: Array<{ name: string; code: string | null }> } {
  const causes: Array<{ name: string; code: string | null }> = [];
  const seen = new Set<unknown>();
  let current: unknown = error, phaseCode: string | null = null;
  while (current instanceof Error && !seen.has(current) && causes.length < FAILURE.maximumCauseDepth) {
    seen.add(current);
    const code = current instanceof MessagingNodeHostFailure ? current.code : null;
    if (code) phaseCode = code;
    causes.push({ name: safeName(current), code });
    current = current.cause;
  }
  return { name: error instanceof Error ? safeName(error) : FAILURE.unknownName, code: phaseCode, causes };
}
