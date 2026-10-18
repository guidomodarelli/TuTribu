/** @vitest-environment node */
/** Exercises numerical projection and privacy at the native statement diagnostics boundary. */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { projectAdmissionStatementProfile } from "@/tests/support/admission-statement-profile";

describe("admission statement diagnostics projection", () => {
  it("should retain ranking and derive execution milliseconds without publishing SQL or private fields", () => {
    const privateMarker = randomUUID(), privateEmail = `private.${randomUUID()}@example.test`;
    const projected = projectAdmissionStatementProfile([{ total_exec_time: "00:00:02.500000", prop_exec_time: "62.5%", ncalls: "5", query: `select '${privateMarker}' from public.session where email='${privateEmail}'`, credential: privateMarker }]);
    expect(projected.statements).toEqual([{ position: 1, operation: "select", mentionedObjects: ["session"], calls: 5, totalExecutionMs: 2500, meanExecutionMs: 500, sharePercent: 62.5 }]);
    expect(JSON.stringify(projected)).not.toContain(privateMarker);
    expect(JSON.stringify(projected)).not.toContain(privateEmail);
    expect(projected.statements[0]).not.toHaveProperty("query");
  });
  it("should handle cumulative intervals longer than one day and quote-owned identifiers", () => {
    const projected = projectAdmissionStatementProfile([{ total_exec_time: "1 day 02:03:04.500", prop_exec_time: "100.0%", ncalls: 2, query: 'UPDATE public."academy_admission_operations" set state=$1' }]);
    expect(projected.statements[0]).toMatchObject({ operation: "update", mentionedObjects: ["academy_admission_operations"], totalExecutionMs: 93_784_500, meanExecutionMs: 46_892_250 });
  });
  it("should identify only approved object names and preserve distinct statements", () => {
    const privateObject = `private_${randomUUID().replaceAll("-", "")}`;
    const projected = projectAdmissionStatementProfile([
      { total_exec_time: "00:00:01", prop_exec_time: "66.7%", ncalls: 10, query: `with scope as (select * from public.${privateObject}) select public.read_admission_reviewer_context($1,$2,$3)` },
      { total_exec_time: "00:00:00.5", prop_exec_time: "33.3%", ncalls: 5, query: "select set_config($1,$2,true),public.current_app_user_id()" },
    ]);
    expect(projected.statements.map((statement) => statement.position)).toEqual([1, 2]);
    expect(projected.statements[0]).toMatchObject({ operation: "with", mentionedObjects: ["read_admission_reviewer_context"] });
    expect(projected.statements[1].mentionedObjects).toEqual(["current_app_user_id", "set_config"]);
    expect(JSON.stringify(projected)).not.toContain(privateObject);
  });
  it("should retain counters without inventing an operation when the provider hides the SQL text", () => {
    expect(projectAdmissionStatementProfile([{ total_exec_time: "00:00:01", prop_exec_time: "100.0%", ncalls: 2, query: null }]).statements[0]).toMatchObject({ operation: "other", mentionedObjects: [], totalExecutionMs: 1000, calls: 2 });
  });
  it.each([
    { total_exec_time: "invalid", prop_exec_time: "50.0%", ncalls: 1, query: "select 1" },
    { total_exec_time: "00:00:01", prop_exec_time: "invalid", ncalls: 1, query: "select 1" },
    { total_exec_time: "00:00:01", prop_exec_time: "50.0%", ncalls: 0, query: "select 1" },
  ])("should reject invalid metrics with a safe diagnostic error", (row) => {
    expect(() => projectAdmissionStatementProfile([row])).toThrow("AdmissionStatementProfile.project failed: invalid_metrics");
  });
});
