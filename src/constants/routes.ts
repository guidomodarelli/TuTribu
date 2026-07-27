const PLATFORM_ROUTE_PREFIX = "/-/";
const TRIBE_ROUTE_SEGMENTS = {
  history: "historia",
  settings: "ajustes",
  channels: "canales",
  courses: "cursos",
  coursesManage: "cursos/gestionar",
  events: "eventos",
  welcome: "bienvenida",
  invitations: "invitaciones",
  invitation: "invitar",
  prices: "precios",
  subscription: "suscripcion",
  tribe: "tribu",
  merits: "meritos",
} as const;

function buildTribeSectionRoute(slug: string, section: string): string {
  return `/${slug}/${section}`;
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
    bySlug: (slug: string) => `/${slug}`,
    channels: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.channels),
    courses: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.courses),
    coursesManage: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.coursesManage),
    create: `${PLATFORM_ROUTE_PREFIX}crear`,
    events: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.events),
    welcome: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.welcome),
    invitations: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.invitations),
    prices: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.prices),
    settings: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.settings),
    subscription: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.subscription),
    tribe: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.tribe),
    merits: (slug: string) =>
      buildTribeSectionRoute(slug, TRIBE_ROUTE_SEGMENTS.merits),
    invitation: (slug: string, token: string) =>
      `/${slug}/${TRIBE_ROUTE_SEGMENTS.invitation}/${token}`,
  },
  home: "/",
} as const;
