const COMMUNITY_ROUTE_PREFIX = "/comunidad/";
const ROUTE_SEGMENT_SEPARATOR = "/";
const COMMUNITY_ROUTE_SEGMENTS = {
  about: "acerca-de",
  categories: "categorias",
  events: "eventos",
  members: "miembros",
  ranking: "ranking",
} as const;

function buildCommunitySectionRoute(slug: string, section: string): string {
  return `${COMMUNITY_ROUTE_PREFIX}${slug}${ROUTE_SEGMENT_SEPARATOR}${section}`;
}

export const ROUTES = {
  api: {
    communities: "/api/communities",
  },
  auth: {
    error: "/auth/error",
    signIn: "/auth/signin",
  },
  communities: {
    about: (slug: string) =>
      buildCommunitySectionRoute(slug, COMMUNITY_ROUTE_SEGMENTS.about),
    bySlug: (slug: string) => COMMUNITY_ROUTE_PREFIX + slug,
    categories: (slug: string) =>
      buildCommunitySectionRoute(slug, COMMUNITY_ROUTE_SEGMENTS.categories),
    create: "/comunidad/crear",
    events: (slug: string) =>
      buildCommunitySectionRoute(slug, COMMUNITY_ROUTE_SEGMENTS.events),
    members: (slug: string) =>
      buildCommunitySectionRoute(slug, COMMUNITY_ROUTE_SEGMENTS.members),
    ranking: (slug: string) =>
      buildCommunitySectionRoute(slug, COMMUNITY_ROUTE_SEGMENTS.ranking),
  },
  home: "/",
} as const;
