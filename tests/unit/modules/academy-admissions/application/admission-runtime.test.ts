/** Exercises complete runtime coverage from the actual installed writer and owned evaluator ports. @module admission-runtime-tests */
import { describe, expect, it } from "vitest";
import { PostgresAdmissionRequestRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-request-repository";
import { ReadAdmissionRuntimeUseCase } from "@/src/modules/academy-admissions/application/use-cases/read-admission-runtime-use-case";
import type { AdmissionExecutionCapabilities } from "@/src/modules/academy-admissions/domain/repositories/admission-execution-capabilities";

describe("installed admission evaluator coverage", () => {
  it("should keep full cutover closed for the common writer with manual/list and local proof without opening SQL, secrets or effects", async () => {
    const unavailable = async (): Promise<never> => { throw new Error("Runtime code coverage must not access SQL or credentials"); };
    const writer = new PostgresAdmissionRequestRepository(unavailable, unavailable, () => { throw new Error("Runtime code coverage must not compose effects"); });
    expect(writer.getCapabilities()).toEqual({ sources: ["common"], policyModes: ["manual_review", "allowlist"], additionalVerification: true });
    expect(await new ReadAdmissionRuntimeUseCase(writer).isPrepared("synthetic-tribe")).toBe(false);
    const detached = writer.getCapabilities();
    (detached.sources as string[]).push("personal");
    expect(writer.getCapabilities().sources).toEqual(["common"]);
  });

  it("should require every published source, mode and verification path instead of approving a callable subset", async () => {
    const complete: AdmissionExecutionCapabilities = { sources: ["common", "personal", "legacy"], policyModes: ["manual_review", "allowlist"], additionalVerification: true };
    const runtime = (coverage: AdmissionExecutionCapabilities) => new ReadAdmissionRuntimeUseCase({ getCapabilities: () => coverage });
    expect(await runtime(complete).isPrepared("synthetic-tribe")).toBe(true);
    expect(await runtime({ ...complete, sources: ["common", "legacy"] }).isPrepared("synthetic-tribe")).toBe(false);
    expect(await runtime({ ...complete, policyModes: ["manual_review"] }).isPrepared("synthetic-tribe")).toBe(false);
    expect(await runtime({ ...complete, additionalVerification: false }).isPrepared("synthetic-tribe")).toBe(false);
    expect(await runtime(complete).isPrepared("")).toBe(false);
  });
});
