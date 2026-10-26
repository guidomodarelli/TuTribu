/** @vitest-environment node */
/** Exercises actual child-process failure without exposing synthetic private output through errors. @module admission-migration-command-observation-tests */
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { executeAdmissionMigrationCommand } from "@/tests/support/admission-migration-command";

describe("private migration command observation", () => {
  it("should retain exit metadata without stdout, stderr or raw cause when the actual child process fails", async () => {
    const privateMarker = randomUUID();
    const error = await executeAdmissionMigrationCommand({ ADMISSION_SYNTHETIC_PRIVATE_OUTPUT: privateMarker }, ["tests/support/process-fixtures/private-migration-failure.cjs"]).then(() => null, (caughtError: unknown) => caughtError);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Private migration observation fixture failed: child_failure_unavailable");
    expect(error.message).toBe("Owned feature migration command failed: exit=1");
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.cause).not.toHaveProperty("stdout");
    expect(error.cause).not.toHaveProperty("stderr");
    expect(error).not.toHaveProperty("stdout");
    expect(error).not.toHaveProperty("stderr");
    expect(inspect(error, { depth: null }).includes(privateMarker)).toBe(false);
  });
});
