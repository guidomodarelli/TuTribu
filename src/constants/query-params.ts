export const QUERY_PARAMS = {
  auth: {
    callbackUrl: "callbackUrl",
    /** Asks Google for its account chooser, so an account change does not sign the same account in again. */
    selectAccount: "selectAccount",
  },
  tribes: {
    error: "error",
    name: "name",
    slug: "slug",
    suggestedSlug: "suggestedSlug",
  },
} as const;
