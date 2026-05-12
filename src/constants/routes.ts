const TRIBE_ROUTE_PREFIX = "/tribu/";
const ROUTE_SEGMENT_SEPARATOR = "/";
const TRIBE_ROUTE_SEGMENTS = {
  history: "historia",
  channels: "canales",
  events: "eventos",
  invitations: "invitaciones",
  invitation: "invitar",
  prices: "precios",
  subscription: "suscripcion",
  tribe: "tribu",
  merits: "meritos",
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
    history: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.history),
    bySlug: (slug: string) => TRIBE_ROUTE_PREFIX + slug,
    channels: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.channels),
    create: "/tribu/crear",
    events: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.events),
    invitations: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.invitations),
    prices: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.prices),
    subscription: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.subscription),
    tribe: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.tribe),
    merits: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.merits),
    invitation: (slug: string, token: string) =>
      `${TRIBE_ROUTE_PREFIX}${slug}${ROUTE_SEGMENT_SEPARATOR}${TRIBE_ROUTE_SEGMENTS.invitation}${ROUTE_SEGMENT_SEPARATOR}${token}`,
  },
  home: "/",
} as const;
