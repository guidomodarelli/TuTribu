/** Native origin comparison reads only the standard request routing headers. @module http-origin-constants */
export const HTTP_ORIGIN_HEADER = { origin: "origin", host: "host" } as const;
/** Identifies internal loopback destinations for the configured public-origin proxy exception. */
export const HTTP_ORIGIN_INTERNAL_HOST = { hostname: "localhost", ipv4: "127.0.0.1", ipv6: "[::1]" } as const;
