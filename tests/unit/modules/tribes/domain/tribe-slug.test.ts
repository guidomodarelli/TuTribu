import {
  buildTribeSlugSuggestion,
  isReservedTribeSlug,
  normalizeTribeSlug,
} from "@/src/modules/tribes/domain/value-objects/tribe-slug";

describe("tribe slug helpers", () => {
  it("normalizes accented names into a kebab-case slug", () => {
    expect(normalizeTribeSlug("  Tribu de Álgebra Avanzada!  ")).toBe(
      "tribu-de-algebra-avanzada"
    );
  });

  it("returns an empty slug when the input has no valid characters", () => {
    expect(normalizeTribeSlug("   ---   ")).toBe("");
  });

  it("marks reserved slugs as unavailable", () => {
    expect(isReservedTribeSlug("crear")).toBe(true);
    expect(isReservedTribeSlug("mi-tribu")).toBe(false);
  });

  it("builds incremental suffix suggestions for conflicting slugs", () => {
    expect(buildTribeSlugSuggestion("mi-tribu", 3)).toBe("mi-tribu-3");
  });
});
