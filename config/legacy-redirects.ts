import type { NextConfig } from "next";

const LEGACY_CREATE_PATH = "/tribu/crear";
const LEGACY_TRIBE_PATH = "/tribu/:legacyTribePath*";
const NEW_CREATE_PATH = "/-/crear";
const NEW_TRIBE_PATH = "/:legacyTribePath*";

/**
 * Returns static redirects for legacy tribe URLs without requiring a runtime proxy.
 */
export const getLegacyRedirects: NonNullable<NextConfig["redirects"]> =
  async () => [
    {
      destination: NEW_CREATE_PATH,
      permanent: true,
      source: LEGACY_CREATE_PATH,
    },
    {
      destination: NEW_TRIBE_PATH,
      permanent: true,
      source: LEGACY_TRIBE_PATH,
    },
  ];
