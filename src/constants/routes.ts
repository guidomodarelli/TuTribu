const COMMUNITY_ROUTE_PREFIX = "/comunidad/";

export const ROUTES = {
  api: {
    communities: "/api/communities",
  },
  auth: {
    error: "/auth/error",
    signIn: "/auth/signin",
  },
  communities: {
    bySlug: (slug: string) => COMMUNITY_ROUTE_PREFIX + slug,
    create: "/comunidad/crear",
  },
  home: "/",
} as const;
