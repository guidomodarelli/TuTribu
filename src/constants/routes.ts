const TRIBE_ROUTE_PREFIX = "/tribu/";
const ROUTE_SEGMENT_SEPARATOR = "/";
const TRIBE_ROUTE_SEGMENTS = {
  about: "acerca-de",
  categories: "categorias",
  events: "eventos",
  members: "miembros",
  ranking: "ranking",
} as const;

function buildTribeSectionRoute(slug: string, section: string): string {
  return `${TRIBE_ROUTE_PREFIX}${slug}${ROUTE_SEGMENT_SEPARATOR}${section}`;
}

export const ROUTES = {
  api: {
    tribes: "/api/tribes",
  },
  auth: {
    error: "/auth/error",
    signIn: "/auth/signin",
  },
  tribes: {
    about: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.about),
    bySlug: (slug: string) => TRIBE_ROUTE_PREFIX + slug,
    categories: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.categories),
    create: "/tribu/crear",
    events: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.events),
    members: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.members),
    ranking: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.ranking),
  },
  home: "/",
} as const;
