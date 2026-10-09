/** Exercises inert preview rows and server-owned temporary import identity. @module allowlist-import-tests */
import { describe, expect, it } from "vitest";
import { createAllowlistImport, prepareAllowlistImportRows, selectAllowlistImportRows, recordAllowlistImportRowOutcomes } from "@/src/modules/academy-admissions/domain/entities/allowlist-import";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

describe("allowlist preview rows", () => {
  it("should normalize aliases and identify repeated valid contacts without an entry, binding or confirmed outcome", () => {
    const rows = prepareAllowlistImportRows([{ rowNumber: 1, identity: " First.Last+tag@Example.Test ", displayName: "  Grupo  " }, { rowNumber: 2, identity: "first.last+tag@example.test", displayName: "Otro" }, { rowNumber: 3, identity: "firstlast@example.test", displayName: "" }], "email");
    expect(rows[0]).toMatchObject({ rowNumber: 1, input: { identity: " First.Last+tag@Example.Test " }, contact: { type: "email", value: "first.last+tag@example.test" }, displayName: "Grupo", errors: [], duplicateOf: null, selected: false, outcome: null, entryId: null, committedAt: null });
    expect(rows[1]).toMatchObject({ duplicateOf: 1, errors: ["admission_contact_duplicate"], selected: false, outcome: null });
    expect(rows[2]).toMatchObject({ contact: { value: "firstlast@example.test" }, errors: [] });
  });

  it("should retain invalid input per row while allowing a later valid proposal for the same contact", () => {
    const rows = prepareAllowlistImportRows([{ rowNumber: 1, identity: "invalid", displayName: "a".repeat(101) }, { rowNumber: 2, identity: "valid@example.test", displayName: "a".repeat(101) }, { rowNumber: 3, identity: "valid@example.test", displayName: "Correcto" }], "email");
    expect(rows[0].errors).toEqual(["admission_contact_invalid", "admission_name_invalid"]);
    expect(rows[0].input.displayName).toHaveLength(101);
    expect(rows[1].errors).toEqual(["admission_name_invalid"]); expect(rows[2].errors).toEqual([]);
    expect(rows.every((row) => row.outcome === null && row.selected === false)).toBe(true);
  });

  it("should require an unambiguous international phone and retain HTML or formula names as data", () => {
    const rows = prepareAllowlistImportRows([{ rowNumber: 1, identity: "+54 9 11 5550-1234", displayName: "<b>Grupo</b>" }, { rowNumber: 2, identity: "1155501234", displayName: "=1+1" }], "phone");
    expect(rows[0]).toMatchObject({ contact: { type: "phone", value: "+5491155501234", country: "AR" }, displayName: "<b>Grupo</b>", errors: [] });
    expect(rows[1]).toMatchObject({ contact: null, displayName: "=1+1", errors: ["admission_country_invalid"] });
  });

  it("should reject invalid row numbering or capacity without manufacturing preview identities", () => {
    expect(() => prepareAllowlistImportRows([{ rowNumber: 2, identity: "valid@example.test", displayName: "" }], "email")).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() => prepareAllowlistImportRows(Array.from({ length: ADMISSION_LIMIT.csvDataRowCount + 1 }, (_, index) => ({ rowNumber: index + 1, identity: "valid@example.test", displayName: "" })), "email")).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it("should fix leader, tribe, policy version and file reference without selecting or confirming rows", () => {
    const now = new Date("2026-10-09T07:00:00Z"), fingerprint = new Uint8Array([1]);
    const preview = createAllowlistImport({ id: "synthetic-import", tribeId: "synthetic-tribe", actorUserId: "synthetic-leader", policyVersion: 3, contactType: "email", fingerprintKeyId: "synthetic-key", fileFingerprint: fingerprint, now, rows: [{ rowNumber: 1, identity: "valid@example.test", displayName: "Grupo" }] });
    expect(preview).toMatchObject({ id: "synthetic-import", tribeId: "synthetic-tribe", actorUserId: "synthetic-leader", policyVersion: 3, contactType: "email", version: 1, state: "preview", createdAt: now });
    expect(preview.expiresAt.toISOString()).toBe("2026-10-10T07:00:00.000Z"); expect(preview.purgeAfter).toEqual(preview.expiresAt);
    expect(preview.rows[0]).toMatchObject({ selected: false, outcome: null, entryId: null, entryVersion: null });
    fingerprint[0] = 2; expect(preview.fileFingerprint[0]).toBe(1);
  });

  it("should also isolate a native Buffer fingerprint rather than retaining its mutable slice", () => {
    const fingerprint = Buffer.from([1]);
    const preview = createAllowlistImport({ id: "synthetic-import", tribeId: "synthetic-tribe", actorUserId: "synthetic-leader", policyVersion: 3, contactType: "email", fingerprintKeyId: "synthetic-key", fileFingerprint: fingerprint, now: new Date("2026-10-09T07:00:00Z"), rows: [] });
    fingerprint[0] = 2; expect(preview.fileFingerprint[0]).toBe(1);
  });
});

/** @returns One current private preview and the current server-owned leader/policy context. */
function fixture() {
  const now = new Date("2026-10-09T07:00:00Z"), context = { actorUserId: "synthetic-leader", tribeId: "synthetic-tribe", policyVersion: 3, contactType: "email" as const, now };
  const preview = createAllowlistImport({ ...context, id: "synthetic-import", fingerprintKeyId: "synthetic-key", fileFingerprint: new Uint8Array([1]), rows: [{ rowNumber: 1, identity: "first@example.test", displayName: "Primero" }, { rowNumber: 2, identity: "second@example.test", displayName: "Segundo" }, { rowNumber: 3, identity: "invalid", displayName: "" }] });
  return { preview, context };
}

describe("explicit import progress", () => {
  it("should select only explicit valid pending rows without marking any outcome", () => {
    const data = fixture(), selected = selectAllowlistImportRows({ ...data, expectedVersion: 1, selectedRows: [2], confirmed: true });
    expect(selected).toMatchObject({ version: 2, state: "processing" });
    expect(selected.rows.map((row) => row.selected)).toEqual([false, true, false]);
    expect(selected.rows.every((row) => row.outcome === null)).toBe(true);
    expect(data.preview.rows.every((row) => !row.selected)).toBe(true);
    expect(selectAllowlistImportRows({ preview: selected, context: data.context, expectedVersion: 2, selectedRows: [2], confirmed: true })).toBe(selected);
  });

  it.each([{ selectedRows: [3] }, { selectedRows: [0] }, { selectedRows: [4] }, { selectedRows: [1, 1] }, { selectedRows: [] }])("should reject an invalid, duplicated or absent selection: $selectedRows", ({ selectedRows }) => {
    const data = fixture(); expect(() => selectAllowlistImportRows({ ...data, expectedVersion: 1, selectedRows, confirmed: true })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it("should close stale policy/version, foreign leader scope and expired previews before selecting", () => {
    const data = fixture(), command = { ...data, expectedVersion: 1, selectedRows: [1], confirmed: true as const };
    expect(() => selectAllowlistImportRows({ ...command, expectedVersion: 2 })).toThrowError(expect.objectContaining({ code: "allowlist_import_conflict" }));
    expect(() => selectAllowlistImportRows({ ...command, context: { ...data.context, policyVersion: 4 } })).toThrowError(expect.objectContaining({ code: "policy_conflict" }));
    expect(() => selectAllowlistImportRows({ ...command, context: { ...data.context, actorUserId: "other-leader" } })).toThrowError(expect.objectContaining({ code: "permission_denied" }));
    expect(() => selectAllowlistImportRows({ ...command, context: { ...data.context, now: data.preview.expiresAt } })).toThrowError(expect.objectContaining({ code: "resource_unavailable" }));
    expect(() => selectAllowlistImportRows({ ...command, context: { ...data.context, now: new Date("2026-10-09T06:59:59Z") } })).toThrowError(expect.objectContaining({ code: "resource_unavailable" }));
  });

  it("should retain actual completed rows when another selected row is still pending and resume only that row", () => {
    const data = fixture(), selected = selectAllowlistImportRows({ ...data, expectedVersion: 1, selectedRows: [1, 2], confirmed: true });
    const first = recordAllowlistImportRowOutcomes({ preview: selected, expectedVersion: 2, context: data.context, outcomes: [{ rowNumber: 1, outcome: "added", entryId: "first-entry", entryVersion: 1, committedAt: data.context.now }] });
    expect(first).toMatchObject({ version: 3, state: "processing" });
    expect(first.rows[0]).toMatchObject({ outcome: "added", entryId: "first-entry", committedAt: data.context.now }); expect(first.rows[1].outcome).toBeNull();
    expect(() => selectAllowlistImportRows({ preview: first, expectedVersion: 3, context: data.context, selectedRows: [1, 2], confirmed: true })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    const resumed = selectAllowlistImportRows({ preview: first, expectedVersion: 3, context: data.context, selectedRows: [2], confirmed: true });
    expect(resumed).toBe(first);
    const done = recordAllowlistImportRowOutcomes({ preview: resumed, expectedVersion: 3, context: data.context, outcomes: [{ rowNumber: 2, outcome: "conflict", entryId: null, entryVersion: null, committedAt: data.context.now }] });
    expect(done).toMatchObject({ version: 4, state: "completed" }); expect(done.rows[0]).toEqual(first.rows[0]); expect(done.rows[1].outcome).toBe("conflict");
  });

  it("should reject contradictory duplicate outcomes atomically and leave known progress unchanged", () => {
    const data = fixture(), selected = selectAllowlistImportRows({ ...data, expectedVersion: 1, selectedRows: [1, 2], confirmed: true });
    const outcome = { rowNumber: 1, outcome: "added" as const, entryId: "first-entry", entryVersion: 1, committedAt: data.context.now };
    const first = recordAllowlistImportRowOutcomes({ preview: selected, expectedVersion: 2, context: data.context, outcomes: [outcome] });
    expect(recordAllowlistImportRowOutcomes({ preview: first, expectedVersion: 3, context: data.context, outcomes: [outcome] })).toBe(first);
    expect(() => recordAllowlistImportRowOutcomes({ preview: first, expectedVersion: 3, context: data.context, outcomes: [{ ...outcome, outcome: "unchanged" }] })).toThrowError(expect.objectContaining({ code: "allowlist_import_conflict" }));
    expect(() => recordAllowlistImportRowOutcomes({ preview: first, expectedVersion: 3, context: data.context, outcomes: [{ ...outcome, rowNumber: 2, entryId: "second-entry" }, { ...outcome, outcome: "unchanged" }] })).toThrowError(expect.objectContaining({ code: "allowlist_import_conflict" }));
    expect(first.rows[0]).toMatchObject({ outcome: "added" }); expect(first.rows[1].outcome).toBeNull();
  });
});
