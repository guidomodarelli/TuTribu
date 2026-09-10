import { describe, it, expect } from "vitest";
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

  it("reserves top-level route names to avoid URL collisions at the root", () => {
    expect(isReservedTribeSlug("api")).toBe(true);
    expect(isReservedTribeSlug("auth")).toBe(true);
    expect(isReservedTribeSlug("tribu")).toBe(true);
    expect(isReservedTribeSlug("robots")).toBe(true);
    expect(isReservedTribeSlug("robots-txt")).toBe(true);
    expect(isReservedTribeSlug("sitemap")).toBe(true);
    expect(isReservedTribeSlug("sitemap-xml")).toBe(true);
    expect(isReservedTribeSlug("-")).toBe(true);
  });

  it("reserves common platform words for future routes", () => {
    expect(isReservedTribeSlug("admin")).toBe(true);
    expect(isReservedTribeSlug("settings")).toBe(true);
    expect(isReservedTribeSlug("ajustes")).toBe(true);
    expect(isReservedTribeSlug("login")).toBe(true);
    expect(isReservedTribeSlug("registro")).toBe(true);
    expect(isReservedTribeSlug("perfil")).toBe(true);
    expect(isReservedTribeSlug("dashboard")).toBe(true);
    expect(isReservedTribeSlug("precios")).toBe(true);
    expect(isReservedTribeSlug("terminos")).toBe(true);
    expect(isReservedTribeSlug("privacidad")).toBe(true);
  });

  it("is case-insensitive for reserved slug checks", () => {
    expect(isReservedTribeSlug("API")).toBe(true);
    expect(isReservedTribeSlug("  Admin  ")).toBe(true);
  });

  it("builds incremental suffix suggestions for conflicting slugs", () => {
    expect(buildTribeSlugSuggestion("mi-tribu", 3)).toBe("mi-tribu-3");
  });
});
