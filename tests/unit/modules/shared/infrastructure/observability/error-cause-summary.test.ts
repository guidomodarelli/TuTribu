/** @vitest-environment node */

/** Covers the safe cause chain summary recorded by server diagnostics. */
import { describe, expect, it } from "vitest";
import { summarizeErrorCauses } from "@/src/modules/shared/infrastructure/observability/error-cause-summary";
import { CLOSED_FAILURE_CAUSE, ERROR_CAUSE_SUMMARY_MAX_ENTRIES } from "@/src/modules/shared/constants/error-cause-summary";

describe("summarizeErrorCauses", () => {
  it("should return no entries when the failure has no cause", () => {
    expect(summarizeErrorCauses(undefined)).toEqual([]);
  });

  it("should keep only closed codes and identifier names, dropping messages and free text", () => {
    const providerFailure = Object.assign(new Error("password=hunter2 rejected"), { code: "contains spaces and secrets" });
    const databaseFailure = Object.assign(new Error("new row violates check constraint"), { code: "23514" });
    const renamed = Object.assign(new Error("boom"), { name: "not a safe name!" });

    const summaries = summarizeErrorCauses(new Error("outer", { cause: new AggregateError([providerFailure, databaseFailure, renamed], "several") }));

    expect(summaries).toEqual([{ name: "Error" }, { name: "AggregateError" }, { name: "Error" }, { name: "Error", code: "23514" }, { name: "UnnamedError" }]);
    expect(JSON.stringify(summaries)).not.toMatch(/hunter2|violates|boom|outer/);
  });

  it("should follow a plain closed failure by its code into its own cause, ignoring its other fields", () => {
    const usageFailure = { code: "dependency_unavailable", message: "secret provider text", cause: Object.assign(new Error("connection refused 10.0.0.1"), { name: "MessagingDeliveryStorageError", code: "dependency_unavailable" }) };
    const summaries = summarizeErrorCauses(usageFailure);
    expect(summaries).toEqual([{ name: CLOSED_FAILURE_CAUSE, code: "dependency_unavailable" }, { name: "MessagingDeliveryStorageError", code: "dependency_unavailable" }]);
    expect(JSON.stringify(summaries)).not.toMatch(/secret|refused|10.0/);
  });

  it("should record a thrown non-error value only by its type", () => {
    expect(summarizeErrorCauses("raw secret text")).toEqual([{ name: "string" }]);
  });

  it("should stop at the entry limit and never loop on a cyclic cause", () => {
    const cyclic = new Error("first");
    const second = new Error("second", { cause: cyclic });
    Object.defineProperty(cyclic, "cause", { value: second });
    expect(summarizeErrorCauses(cyclic)).toHaveLength(2);

    let deep: unknown = new Error("root");
    for (let level = 0; level < 20; level += 1) deep = new Error(`level ${level}`, { cause: deep });
    expect(summarizeErrorCauses(deep)).toHaveLength(ERROR_CAUSE_SUMMARY_MAX_ENTRIES);
  });
});
