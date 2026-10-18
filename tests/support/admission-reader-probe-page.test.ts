/** @vitest-environment node */
/** Verifies observable fixture behavior before using its markup in an OS-reader comparison. */
import { JSDOM } from "jsdom";
import { within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmissionReaderProbePage } from "./admission-reader-probe-page.mjs";
import { ADMISSION_READER_PROBE as PROBE } from "./constants/admission-reader-probe.mjs";

describe("native reader comparison page", () => {
  for (const markupVariant of Object.values(PROBE.markupVariants)) {
    it(`should update the original live region through its own button for ${markupVariant}`, () => {
      const item = { title: "Prueba nativa", focus: "Control de lectura ab12", status: "Aviso de lectura ab12", markupVariant };
      const page = new JSDOM(renderAdmissionReaderProbePage(item), { runScripts: "dangerously" });
      try {
        const content = within(page.window.document.body), region = content.getByRole("status"), originalText = region.firstChild;
        expect(region.getAttribute("aria-live")).toBe("polite");
        expect(region.getAttribute("aria-atomic")).toBe("true");
        expect(region.textContent).not.toBe(item.status);
        content.getByRole("button", { name: item.focus }).click();
        expect(content.getByRole("status")).toBe(region);
        expect(region.textContent).toBe(item.status);
        if (markupVariant !== PROBE.markupVariants.empty) expect(region.firstChild).toBe(originalText);
      } finally { page.window.close(); }
    });
  }

  it("should reject an undeclared comparison variant", () => {
    expect(() => renderAdmissionReaderProbePage({ title: "Prueba", focus: "Control", status: "Aviso", markupVariant: "unsupported" })).toThrow("unsupported_markup_variant");
  });
});
