/** @vitest-environment node */
/** Exercises safe diagnostic propagation without serializing private backend data. */
import { describe, expect, it } from "vitest";
import { MessagingNodeHostFailure, readMessagingNodePhaseFailureCode, summarizeMessagingNodeHostFailure } from "@/tests/support/messaging-node-host-failure";
import { ADMISSION_NODE_HOST } from "@/tests/support/constants/admission-node-host";
import { MESSAGING_NODE_HOST_FAILURE as FAILURE } from "@/tests/support/constants/messaging-node-host-failure";

describe("messaging native host failure diagnostics", () => {
  it("preserves the phase code through the restore owner's private cause", () => {
    const phase = new MessagingNodeHostFailure("preflight_rejected", new Error("private provider payload"));
    const outer = new Error("private restore context", { cause: phase });
    outer.name = "AcademyAdmissionRestoreError";
    expect(summarizeMessagingNodeHostFailure(outer)).toEqual({
      name: "AcademyAdmissionRestoreError", code: "preflight_rejected",
      causes: [{ name: "AcademyAdmissionRestoreError", code: null }, { name: FAILURE.errorName, code: "preflight_rejected" }, { name: "Error", code: null }],
    });
    expect(phase.cause).toBeInstanceOf(Error);
  });

  it("does not expose arbitrary names, messages, codes or stacks", () => {
    const privateError = Object.assign(new Error("private message"), { name: "private name", code: "private code", stack: "private stack" });
    expect(summarizeMessagingNodeHostFailure(privateError)).toEqual({ name: FAILURE.unknownName, code: null, causes: [{ name: FAILURE.unknownName, code: null }] });
    expect(readMessagingNodePhaseFailureCode(privateError)).toBe(FAILURE.phaseFailed);
  });

  it("replaces unsafe endpoint codes before storing or transporting them", () => {
    const failure = new MessagingNodeHostFailure("private value with spaces");
    expect(failure.code).toBe(ADMISSION_NODE_HOST.unknownFailureCode);
    expect(summarizeMessagingNodeHostFailure(failure).code).toBe(ADMISSION_NODE_HOST.unknownFailureCode);
  });

  it("maps an own assertion label and rejects appended private context", () => {
    expect(readMessagingNodePhaseFailureCode(new Error("MessagingRestoreNodePhase.verify failed: PREFLIGHT_ACCEPTED"))).toBe("preflight_accepted");
    expect(readMessagingNodePhaseFailureCode(new Error("MessagingRestoreNodePhase.verify failed: PREFLIGHT_ACCEPTED private context"))).toBe(FAILURE.phaseFailed);
  });

  it("preserves the reopening owner's bounded failure without serializing private context", () => {
    expect(readMessagingNodePhaseFailureCode(new Error("Messaging restore reopening failed: fresh_dispatch_unconfirmed"))).toBe("fresh_dispatch_unconfirmed");
    expect(readMessagingNodePhaseFailureCode(new Error("Messaging restore reopening failed: fresh_dispatch_unconfirmed private context"))).toBe(FAILURE.phaseFailed);
  });

  it("preserves only SQLSTATE metadata through nested native errors", () => {
    const postgresError = Object.assign(new Error("private relation and parameters"), { code: "42501" });
    expect(readMessagingNodePhaseFailureCode(new Error("private wrapper", { cause: postgresError }))).toBe("postgres_42501");
  });

  it("reports invalid private input without validation values", () => {
    const validationError = new Error("private input value"); validationError.name = "ZodError";
    expect(readMessagingNodePhaseFailureCode(validationError)).toBe(FAILURE.privateInputInvalid);
  });

  it("terminates cyclic causes without dropping the own failure", () => {
    const failure = new MessagingNodeHostFailure("preflight_rejected");
    failure.cause = failure;
    expect(summarizeMessagingNodeHostFailure(failure).causes).toEqual([{ name: FAILURE.errorName, code: "preflight_rejected" }]);
  });

  it("bounds very deep private cause chains", () => {
    let error = new Error("private root");
    for (let index = 0; index <= FAILURE.maximumCauseDepth; index++) error = new Error("private wrapper", { cause: error });
    expect(summarizeMessagingNodeHostFailure(error).causes).toHaveLength(FAILURE.maximumCauseDepth);
    expect(summarizeMessagingNodeHostFailure({ message: "private non-error" })).toEqual({ name: FAILURE.unknownName, code: null, causes: [] });
  });
});
