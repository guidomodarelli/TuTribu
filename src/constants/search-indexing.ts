/**
 * Defines crawler-facing route policy for metadata routes.
 *
 * @module search-indexing
 */

/**
 * Canonical sitemap path exposed by the App Router metadata route.
 */
export const SITEMAP_PATH = "/sitemap.xml";

/**
 * Default update cadence advertised for stable public sitemap URLs.
 */
export const SITEMAP_CHANGE_FREQUENCY = "weekly";

/**
 * Public routes that crawlers may index through the generated sitemap.
 */
export const INDEXABLE_ROUTES = {
  home: "/",
} as const;

/**
 * Route patterns that should not be indexed by crawlers.
 *
 * The tribe story page (`/*\/historia`) is intentionally NOT listed: it is the
 * public "About" of joinable tribes, indexed through the sitemap.
 */
export const DISALLOWED_CRAWLER_ROUTES = [
  "/api/",
  "/auth/",
  "/*/invitar",
  "/*/tribu",
  "/*/bienvenida",
  "/*/canales",
  "/*/cursos",
  "/*/eventos",
  "/*/invitaciones",
  "/*/precios",
  "/*/suscripcion",
  "/*/meritos",
] as const;
