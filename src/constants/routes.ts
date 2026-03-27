const COMMUNITY_ROUTE_PREFIX = "/comunidad/";

export const ROUTES = {
  api: {
    communities: "/api/communities",
  },
  auth: {
    callback: "/auth/callback",
    error: "/auth/error",
    googleStart: "/auth/google/start",
    signIn: "/auth/signin",
    signOut: "/auth/signout",
  },
  communities: {
    bySlug: (slug: string) => COMMUNITY_ROUTE_PREFIX + slug,
    create: "/comunidad/crear",
  },
  home: "/",
} as const;
