/** Bounds only private test hosts and the official manager configuration format. */
export const OWNED_MESSAGING_NODE_DEPLOYMENT = {
  maximumFunctions: 4,
  functionNonceCharacters: 8,
  functionSlugPrefix: "msgrestore",
  bundleDirectoryPrefix: "messaging-node-restore-",
  environmentAliasPrefix: "MESSAGING_NATIVE_DEPLOY_",
  cliProfile: "DEFAULT",
  configPackage: "@neon/config/v1",
  configFilename: "neon.ts",
  databaseEndpointVariable: "MESSAGING_NATIVE_DATABASE_ENDPOINT",
  writeEndpointType: "read_write",
  environmentNamePattern: /^[A-Z][A-Z_0-9]*$/,
  reservedEnvironmentNames: ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "NEON_BRANCH", "NEON_API_KEY", "NEON_ACCESS_TOKEN", "MESSAGING_NATIVE_DATABASE_ENDPOINT"],
} as const;
