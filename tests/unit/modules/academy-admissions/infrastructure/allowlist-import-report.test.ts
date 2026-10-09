/** Exercises inert report cells, correct CSV boundaries and the reusable input template. @module allowlist-import-report-tests */
import { describe, expect, it } from "vitest";
import { createAllowlistImportTemplate, renderAllowlistImportReport } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-import-report";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import type { AllowlistImportDto } from "@/src/modules/academy-admissions/application/results/admission-management-result-schemas";

describe("allowlist CSV report", () => {
  it("should offer the exact two-column input header without an inserted contact or executable sample", () => {
    const template = createAllowlistImportTemplate();
    expect(template).toBe("identity,display_name\r\n"); expect(parseAllowlistCsv(template)).toEqual([]);
  });

  it.each(["=1+1", "+1+1", "-1+1", "@SUM(1)", "  =1+1", "\t=1+1", "\r=1+1", "＝1+1", "＋1+1", "－1+1", "＠SUM(1)"])("should neutralize spreadsheet prefixes and preserve them inside one quoted cell: %s", (displayName) => {
    const report: AllowlistImportDto = { importId: "8d4d1192-3279-47de-a858-046280a61109", sourceVersion: 1, state: "preview", expiresAt: "2026-10-10T08:00:00Z", counts: { selected: 0, added: 0, unchanged: 0, skipped: 0, conflict: 0 }, rows: [{ rowNumber: 1, identity: "synthetic@example.test", displayName, selected: false, errors: [] }] };
    const text = renderAllowlistImportReport(report);
    expect(text).toContain(`"'\t${displayName.replaceAll('"', '""')}"`);
    expect(text).not.toContain(report.importId);
  });

  it("should escape commas, quotes, newlines and HTML without creating extra cells or executing content", () => {
    const report: AllowlistImportDto = { importId: "8d4d1192-3279-47de-a858-046280a61109", sourceVersion: 1, state: "preview", expiresAt: "2026-10-10T08:00:00Z", counts: { selected: 0, added: 0, unchanged: 0, skipped: 0, conflict: 0 }, rows: [{ rowNumber: 1, identity: "synthetic@example.test", displayName: '<b>Grupo, "A"</b>\nOtra línea', selected: false, errors: [] }] };
    expect(renderAllowlistImportReport(report)).toContain('"<b>Grupo, ""A""</b>\nOtra línea"');
    expect(report.rows[0].displayName).toBe('<b>Grupo, "A"</b>\nOtra línea');
  });
});
