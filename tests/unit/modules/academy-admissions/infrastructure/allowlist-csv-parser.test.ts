/** Exercises real CSV input decoding and product limits before any import persistence. @module allowlist-csv-parser-tests */
import { describe, expect, it } from "vitest";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

describe("allowlist CSV input", () => {
  it("should decode UTF-8 BOM, quoted commas, escaped quotes and embedded newlines as inert data", () => {
    const input = new TextEncoder().encode('\ufeffidentity,display_name\r\nfirst.last+tag@example.test,"José, ""Grupo"""\r\nother@example.test,"Primera\nsegunda"\r\nformula@example.test,=1+1\r\nhtml@example.test,<b>Nombre</b>\r\n');
    expect(parseAllowlistCsv(input)).toEqual([
      { rowNumber: 1, identity: "first.last+tag@example.test", displayName: 'José, "Grupo"' },
      { rowNumber: 2, identity: "other@example.test", displayName: "Primera\nsegunda" },
      { rowNumber: 3, identity: "formula@example.test", displayName: "=1+1" },
      { rowNumber: 4, identity: "html@example.test", displayName: "<b>Nombre</b>" },
    ]);
  });

  it("should preserve empty or invalid row values for per-row validation rather than failing the file", () => {
    expect(parseAllowlistCsv("identity,display_name\ninvalid,\n,Grupo\nvalid@example.test," )).toEqual([
      { rowNumber: 1, identity: "invalid", displayName: "" }, { rowNumber: 2, identity: "", displayName: "Grupo" }, { rowNumber: 3, identity: "valid@example.test", displayName: "" },
    ]);
    expect(parseAllowlistCsv("identity,display_name")).toEqual([]);
  });

  it.each(["", "display_name,identity\na,b", "identity;display_name\na;b", "identity,display_name\na", "identity,display_name\na,b,c", 'identity,display_name\na,"unterminated', 'identity,display_name\na,b"quoted', 'identity,display_name\na,"b"extra', "identity,display_name\ra,b"]) ("should reject a globally unusable header or record format: %s", (input) => {
    expect(() => parseAllowlistCsv(input)).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it("should accept exactly ten thousand data rows and reject an additional row", () => {
    const row = "person@example.test,\n", header = "identity,display_name\n";
    const result = parseAllowlistCsv(header + row.repeat(ADMISSION_LIMIT.csvDataRowCount));
    expect(result).toHaveLength(10_000); expect(result.at(-1)?.rowNumber).toBe(10_000);
    expect(() => parseAllowlistCsv(header + row.repeat(ADMISSION_LIMIT.csvDataRowCount + 1))).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it("should enforce the byte ceiling independently with actual UTF-8 bytes", () => {
    const prefix = 'identity,display_name\nvalid@example.test,"', suffix = '"', byteBase = new TextEncoder().encode(prefix + suffix).length;
    const exact = prefix + "a".repeat(ADMISSION_LIMIT.csvByteCount - byteBase) + suffix;
    expect(parseAllowlistCsv(exact)).toHaveLength(1);
    expect(() => parseAllowlistCsv(exact + "\n")).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    const multibyte = prefix + "á".repeat(Math.floor((ADMISSION_LIMIT.csvByteCount - byteBase) / 2) + 1) + suffix;
    expect(() => parseAllowlistCsv(multibyte)).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it("should reject malformed UTF-8 and unpaired UTF-16 instead of silently replacing contact data", () => {
    expect(() => parseAllowlistCsv(new Uint8Array([0xc3, 0x28]))).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() => parseAllowlistCsv("identity,display_name\nvalid@example.test,\ud800")).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() => parseAllowlistCsv('identity,display_name\nvalid@example.test,"nul\0data"')).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
});
