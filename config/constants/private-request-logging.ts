/** Keeps unredactable private URLs out of Next's development-only incoming-request sink. @module private-request-logging-constants */
import type { NextConfig } from "next";

/** Ordinary query-free request diagnostics remain enabled; private inputs use the safe contextual logger. */
export const PRIVATE_REQUEST_LOGGING = {
  incomingRequests: {
    ignore: [
      /\/api\/calendar\/tribes\/[^/]+\/feed\//,
      /\?/,
      /%[0-9a-f]{2}/i,
      /\/(?:api\/)?auth(?:\/|$)/,
      /\/(?:api\/)?admissions(?:\/|$)/,
      /\/api\/tribes\/[^/?]+\/(?:admissions|messaging)(?:\/|$)/,
      /\/[^/?]+\/academia\/admissions(?:\/|$)/,
      /\/[^/?]+\/invitar(?:\/|$)/,
    ],
  },
} satisfies Exclude<NextConfig["logging"], false | undefined>;
