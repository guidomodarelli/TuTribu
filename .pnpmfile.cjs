/** Keeps TypeScript 7 as the project compiler while ESLint uses the supported JavaScript API. */
const TYPESCRIPT_API_PACKAGE = "npm:@typescript/typescript6@^6.0.2";
const TYPESCRIPT_API_CONSUMERS = new Set(["typescript-eslint", "ts-api-utils"]);

/**
 * Supplies the official compatibility API only to ESLint compiler-API consumers.
 * @param {object} packageManifest - Dependency metadata supplied by pnpm.
 * @returns {object} Metadata with a private compatibility dependency when required.
 */
function readPackage(packageManifest) {
  const usesCompilerApi = packageManifest.name.startsWith("@typescript-eslint/") ||
    TYPESCRIPT_API_CONSUMERS.has(packageManifest.name);
  if (!usesCompilerApi || !packageManifest.peerDependencies?.typescript) return packageManifest;

  const peerDependencies = { ...packageManifest.peerDependencies };
  const peerDependenciesMeta = { ...packageManifest.peerDependenciesMeta };
  delete peerDependencies.typescript;
  delete peerDependenciesMeta.typescript;
  return {
    ...packageManifest,
    dependencies: { ...packageManifest.dependencies, typescript: TYPESCRIPT_API_PACKAGE },
    peerDependencies,
    peerDependenciesMeta,
  };
}

module.exports = { hooks: { readPackage } };
