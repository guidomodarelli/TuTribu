import {
  buildCommunitySlugSuggestion,
  isReservedCommunitySlug,
  normalizeCommunitySlug,
} from "@/src/modules/communities/domain/value-objects/community-slug";

describe("community slug helpers", () => {
  it("normalizes accented names into a kebab-case slug", () => {
    expect(normalizeCommunitySlug("  Tribu de Álgebra Avanzada!  ")).toBe(
      "tribu-de-algebra-avanzada"
    );
  });

  it("returns an empty slug when the input has no valid characters", () => {
    expect(normalizeCommunitySlug("   ---   ")).toBe("");
  });

  it("marks reserved slugs as unavailable", () => {
    expect(isReservedCommunitySlug("crear")).toBe(true);
    expect(isReservedCommunitySlug("mi-tribu")).toBe(false);
  });

  it("builds incremental suffix suggestions for conflicting slugs", () => {
    expect(buildCommunitySlugSuggestion("mi-tribu", 3)).toBe("mi-tribu-3");
  });
});
