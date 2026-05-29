/**
 * Provides normalization and reservation helpers for public tribe slugs.
 *
 * @module tribe-slug
 */

/**
 * Splits accented characters from their marks before ASCII cleanup.
 */
const TRIBE_SLUG_NORMALIZATION_FORM = "NFD";
/**
 * Reserves root-level application paths and common future route names.
 */
const TRIBE_SLUG_RESERVED_VALUE_LIST = [
  "api",
  "auth",
  "tribu",
  "robots",
  "robots-txt",
  "sitemap",
  "sitemap-xml",
  "-",
  "admin",
  "about",
  "settings",
  "configuracion",
  "ajustes",
  "blog",
  "help",
  "ayuda",
  "login",
  "logout",
  "signin",
  "signup",
  "registro",
  "ingresar",
  "salir",
  "home",
  "inicio",
  "dashboard",
  "panel",
  "perfil",
  "profile",
  "cuenta",
  "account",
  "pricing",
  "precios",
  "terms",
  "terminos",
  "privacy",
  "privacidad",
  "contact",
  "contacto",
  "soporte",
  "support",
  "docs",
  "docu",
  "documentacion",
  "legal",
  "404",
  "500",
  "_next",
  "static",
  "public",
  "assets",
  "img",
  "images",
  "media",
  "fonts",
  "crear",
] as const;
/**
 * Supports fast case-normalized lookup for reserved tribe slug values.
 */
const TRIBE_SLUG_RESERVED_VALUES = new Set<string>(TRIBE_SLUG_RESERVED_VALUE_LIST);
/**
 * Converts user-entered text into the canonical tribe slug format.
 *
 * @param input - Raw user-entered slug or tribe name.
 * @returns Canonical lowercase single-segment slug, or an empty string when no valid characters remain.
 */
export function normalizeTribeSlug(input: string): string {
  return input
    .normalize(TRIBE_SLUG_NORMALIZATION_FORM)
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Checks whether a canonical slug is reserved by application routes.
 *
 * @param slug - Candidate tribe slug.
 * @returns Whether the slug is blocked for tribe creation.
 */
export function isReservedTribeSlug(slug: string): boolean {
  return TRIBE_SLUG_RESERVED_VALUES.has(slug.trim().toLowerCase());
}

/**
 * Builds the next conflict-resolution suggestion for an unavailable slug.
 *
 * @param baseSlug - Canonical slug requested by the user.
 * @param index - Numeric suffix to append.
 * @returns Suggested canonical slug with an incremental suffix.
 */
export function buildTribeSlugSuggestion(baseSlug: string, index: number): string {
  return `${baseSlug}-${index}`;
}
