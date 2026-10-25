/** Exercises how leader lists accumulate «Ver más» pages and rereads of their first page. @module admission-list-pages-tests */
import { describe, expect, it } from "vitest";
import { appendAdmissionListPage, refreshAdmissionListFirstPage } from "@/lib/academy-admissions/admission-list-pages";

/** @param id - Stable resource id. @param version - Resource version. @returns One synthetic listed resource. */
function entry(id: string, version = 1) { return { id, version }; }

describe("leader list pages", () => {
  it("should append only new items and keep each shown item in place with its newer copy", () => {
    const shown = [entry("first"), entry("second")];
    expect(appendAdmissionListPage(shown, [entry("second", 2), entry("third")])).toEqual([entry("first"), entry("second", 2), entry("third")]);
    expect(shown).toEqual([entry("first"), entry("second")]);
  });

  it("should put a reread first page on top and keep the older loaded items it no longer covers", () => {
    const shown = [entry("first"), entry("second"), entry("older")];
    expect(refreshAdmissionListFirstPage([entry("new"), entry("first", 3)], shown)).toEqual([entry("new"), entry("first", 3), entry("second"), entry("older")]);
  });
});
