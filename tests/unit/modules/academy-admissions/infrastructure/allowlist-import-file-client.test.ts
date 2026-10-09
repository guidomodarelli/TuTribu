/** Exercises native FileReader with strict UTF-8 and the real CSV grammar. @module allowlist-import-file-client-tests */
import { describe, expect, it } from "vitest";
import { readAllowlistImportFile } from "@/lib/academy-admissions/allowlist-import-file-client";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

describe("explicit CSV file input", () => {
  it("should preserve quoted multiline values and inert formulas as data", async () => {
    const file = new File(['identity,display_name\r\nsynthetic@example.test,"<script>data()</script>\n=1+1"\r\n'], "synthetic.csv", { type: "text/csv" });
    expect(await readAllowlistImportFile(file, new AbortController().signal)).toMatchObject({ status: "ready", rowCount: 1, draft: { fileName: "synthetic.csv", csvText: expect.stringContaining("<script>data()</script>") } });
  });
  it("should reject invalid UTF-8, global format, column mismatch and files over the byte limit before POST", async () => {
    for (const file of [new File([new Uint8Array([255])], "synthetic.csv"), new File(["other,display_name\nidentity,Nombre"], "synthetic.csv"), new File(["identity,display_name\nidentity,Nombre,extra"], "synthetic.csv"), new File([new Uint8Array(ADMISSION_LIMIT.csvByteCount + 1)], "synthetic.csv")]) expect(await readAllowlistImportFile(file, new AbortController().signal)).toEqual({ status: "invalid" });
  });
  it("should preserve intentional cancellation without returning an error or proposal", async () => {
    const controller = new AbortController(); controller.abort();
    expect(await readAllowlistImportFile(new File(["identity,display_name"], "synthetic.csv"), controller.signal)).toEqual({ status: "aborted" });
  });
});
