/** Exercises own public preview projection including invalid input without private context. @module allowlist-import-result-tests */
import { describe, expect, it } from "vitest";
import { createAllowlistImport, selectAllowlistImportRows, recordAllowlistImportRowOutcomes } from "@/src/modules/academy-admissions/domain/entities/allowlist-import";
import { presentAllowlistImport } from "@/src/modules/academy-admissions/application/results/allowlist-import-result";
import { allowlistImportSchema } from "@/src/modules/academy-admissions/application/results/admission-management-result-schemas";

/** @returns Current private context/preview; private references never cross the public DTO. */
function fixture() {
  const context = { actorUserId: "synthetic-leader", tribeId: "synthetic-tribe", policyVersion: 3, contactType: "email" as const, now: new Date("2026-10-09T07:00:00Z") };
  const preview = createAllowlistImport({ ...context, id: "8d4d1192-3279-47de-a858-046280a61109", fingerprintKeyId: "private-key", fileFingerprint: new Uint8Array([1]), rows: [{ rowNumber: 1, identity: "first@example.test", displayName: "Grupo" }, { rowNumber: 2, identity: "invalid", displayName: "a".repeat(101) }] });
  return { preview, context };
}

describe("allowlist import public projection", () => {
  it("should keep invalid entered values and errors without selecting rows or exposing protected references", () => {
    const data = fixture(), dto = presentAllowlistImport(data.preview);
    expect(dto.rows[1]).toMatchObject({ identity: "invalid", displayName: "a".repeat(101), selected: false, errors: ["admission_contact_invalid", "admission_name_invalid"] });
    expect(dto).toMatchObject({ sourceVersion: 1, state: "preview", counts: { selected: 0, added: 0, unchanged: 0, skipped: 0, conflict: 0 } });
    for (const key of ["actorUserId", "tribeId", "policyVersion", "fingerprintKeyId", "fileFingerprint"]) expect(dto).not.toHaveProperty(key);
    expect(dto.rows[0]).not.toHaveProperty("contact"); expect(dto.rows[0]).not.toHaveProperty("entryId");
    expect(allowlistImportSchema.safeParse(dto).success).toBe(true);
    expect(allowlistImportSchema.safeParse({ ...dto, rows: dto.rows.map((row) => ({ ...row, selected: true })) }).success).toBe(false);
  });

  it("should count only preserved owner outcomes and expose the original entry version separately", () => {
    const data = fixture(), selected = selectAllowlistImportRows({ ...data, expectedVersion: 1, selectedRows: [1], confirmed: true });
    const done = recordAllowlistImportRowOutcomes({ preview: selected, context: data.context, expectedVersion: 2, outcomes: [{ rowNumber: 1, outcome: "unchanged", entryId: "original-entry", entryVersion: 4, committedAt: data.context.now }] });
    expect(presentAllowlistImport(done)).toMatchObject({ sourceVersion: 3, state: "completed", counts: { selected: 1, unchanged: 1, added: 0 }, rows: [{ outcome: "unchanged", version: 4 }, { selected: false }] });
  });
});
