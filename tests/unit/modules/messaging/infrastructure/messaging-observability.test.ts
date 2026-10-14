/** Tests the real contextual logger and closed worker reporter, capturing only its console boundary. @module messaging-observability-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { createMessagingDispatchReporter } from "@/src/modules/messaging/infrastructure/messaging-observability";
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
      expect(JSON.parse(serialized)).toEqual({ level: "error", message: "Dispatch validation failed", feature: "synthetic_messaging", operation: "dispatch", requestId, traceId, metadata: { stage: "prepare", code: "connection_incomplete", deliveryId, attemptId } });
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
      expect(JSON.parse(serialized).metadata).toEqual({ stage: "send", code: "unexpected_failure" });
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
