/** Tests the real contextual logger and closed worker reporter, capturing only its console boundary. @module messaging-observability-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { createAdmissionMaintenanceFailureReporter, createMessagingDispatchReporter } from "@/src/modules/messaging/infrastructure/messaging-observability";
import { AdmissionMessagingMaintenanceError } from "@/src/modules/messaging/domain/errors/admission-messaging-maintenance-error";
import { AdmissionExpirationError } from "@/src/modules/academy-admissions/domain/errors/admission-expiration-error";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

describe("safe messaging diagnostics", () => {
  it("should retain native correlation and minimum original identities without serializing a classified private cause", () => {
    const requestId = randomUUID(), traceId = randomUUID(), deliveryId = randomUUID(), attemptId = randomUUID(), privateMarker = randomUUID();
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const report = createMessagingDispatchReporter(createServerLogger({ feature: "synthetic_messaging", operation: "dispatch", requestId, traceId }), "Dispatch validation failed");
      report({ stage: "prepare", deliveryId, attemptId, cause: new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete, { cause: new Error(privateMarker) }) });
      expect(output).toHaveBeenCalledTimes(1);
      const serialized = String(output.mock.calls[0][0]);
      expect(JSON.parse(serialized)).toEqual({ level: "error", message: "Dispatch validation failed", feature: "synthetic_messaging", operation: "dispatch", requestId, traceId, metadata: { stage: "prepare", code: "connection_incomplete", deliveryId, attemptId, causes: [{ name: "MessagingSecretAccessError", code: "connection_incomplete" }, { name: "Error" }] } });
      expect(serialized).not.toContain(privateMarker);
      expect(JSON.parse(serialized)).not.toHaveProperty("error");
    } finally { output.mockRestore(); }
  });
  it("should omit exception bodies and arbitrary fields instead of using them as diagnostic labels", () => {
    const privateMarker = randomUUID(), output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const report = createMessagingDispatchReporter(createServerLogger({ feature: "synthetic_messaging", operation: "dispatch", requestId: randomUUID() }), "Dispatch validation failed");
      report({ stage: "send", cause: { message: privateMarker, stack: privateMarker, apiKey: privateMarker, recipient: privateMarker } });
      const serialized = String(output.mock.calls[0][0]);
      expect(JSON.parse(serialized).metadata).toEqual({ stage: "send", code: "unexpected_failure", causes: [{ name: "object" }] });
      expect(serialized).not.toContain(privateMarker);
    } finally { output.mockRestore(); }
  });
  it("should suppress a repeated original failure while retaining distinct attempts and independent failures", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const report = createMessagingDispatchReporter(createServerLogger({ feature: "synthetic_messaging", operation: "dispatch", requestId: randomUUID() }), "Dispatch validation failed");
      const cause = new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete), attemptId = randomUUID();
      report({ stage: "prepare", attemptId, cause }); report({ stage: "prepare", attemptId, cause });
      expect(output).toHaveBeenCalledTimes(1);
      report({ stage: "prepare", attemptId: randomUUID(), cause });
      report({ stage: "prepare", attemptId, cause: new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete) });
      expect(output).toHaveBeenCalledTimes(3);
    } finally { output.mockRestore(); }
  });
});

describe("safe admission maintenance diagnostics", () => {
  /** @param error - Reported phase failure. @returns The single parsed log entry of the real logger and its raw text. */
  function reportOnce(error: unknown) {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      createAdmissionMaintenanceFailureReporter(createServerLogger({ feature: "messaging", operation: "admission_messaging_maintenance", requestId: randomUUID() }), "Admission messaging maintenance operation failed")(error, { operation: "run_admission_messaging_maintenance_phase", runId: "run", phase: "expire_requests" });
      expect(output).toHaveBeenCalledTimes(1);
      const serialized = String(output.mock.calls[0][0]);
      return { entry: JSON.parse(serialized) as { metadata: Record<string, unknown> }, serialized };
    } finally { output.mockRestore(); }
  }

  it("should name a guard rejection wrapped by its owner and the whole cause chain instead of a bare unresolved reason", () => {
    const { entry } = reportOnce(new AdmissionExpirationError("operation_unresolved", { cause: new AdmissionMessagingMaintenanceError("deadline_reached") }));
    expect(entry.metadata).toEqual({ operation: "run_admission_messaging_maintenance_phase", reason: "deadline_reached", runId: "run", phase: "expire_requests", causes: [{ name: "AdmissionExpirationError", code: "operation_unresolved" }, { name: "AdmissionMessagingMaintenanceError", code: "deadline_reached" }] });
  });

  it("should keep a database failure unresolved while logging its SQLSTATE and never its message", () => {
    const privateMarker = randomUUID();
    const { entry, serialized } = reportOnce(new AdmissionExpirationError("operation_unresolved", { cause: Object.assign(new Error(privateMarker), { name: "error", code: "23502", column: privateMarker }) }));
    expect(entry.metadata).toMatchObject({ reason: "operation_unresolved", causes: [{ name: "AdmissionExpirationError", code: "operation_unresolved" }, { name: "error", code: "23502" }] });
    expect(serialized).not.toContain(privateMarker);
  });
});
