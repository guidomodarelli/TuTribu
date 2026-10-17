/** @vitest-environment node */
/** Checks the diagnostic boundary against wrapped native facts and private canaries. @module postgres-test-diagnostic-tests */
import { describe, expect, it } from "vitest";
import { readPostgresTestDiagnostics } from "./postgres-test-diagnostics";

describe("native Postgres test diagnostics", () => {
  it("should retain distinct native causes without private data when recovery aggregates failures", () => {
    // Arrange: native wrappers carry SQL text and identity canaries that must stay private.
    const privateCanary = "private-query-and-contact@example.test";
    const idleFailure = Object.assign(new Error(privateCanary), { code: "25P03", query: privateCanary });
    const deadlock = Object.assign(new Error(privateCanary), { code: "40P01", detail: privateCanary });
    const timeout = new Error("timeout exceeded when trying to connect");
    const error = new AggregateError([idleFailure, deadlock, timeout], privateCanary, { cause: new Error(privateCanary, { cause: idleFailure }) });

    // Act and assert: only the closed diagnostic contract crosses the output boundary.
    const result = readPostgresTestDiagnostics(error);
    expect(result).toEqual({ sqlStates: ["25P03", "40P01"], poolCheckoutTimedOut: true });
    expect(JSON.stringify(result)).not.toContain(privateCanary);
  });

  it("should reject a generic disconnect as idle-guard evidence when no native idle code exists", () => {
    expect(readPostgresTestDiagnostics(new Error("Connection terminated unexpectedly"))).toEqual({ sqlStates: [], poolCheckoutTimedOut: false });
    expect(readPostgresTestDiagnostics(Object.assign(new Error("private"), { code: "ECONNRESET" }))).toEqual({ sqlStates: [], poolCheckoutTimedOut: false });
  });

  it("should bound cyclic causes and omit arbitrary values when diagnostics are malformed", () => {
    const cyclic = Object.assign(new Error("private"), { code: "private-secret" });
    cyclic.cause = cyclic;
    expect(readPostgresTestDiagnostics(cyclic)).toEqual({ sqlStates: [], poolCheckoutTimedOut: false });
    expect(readPostgresTestDiagnostics(null)).toEqual({ sqlStates: [], poolCheckoutTimedOut: false });
  });
});
