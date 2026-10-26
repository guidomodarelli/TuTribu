/** @vitest-environment node */
/** Exercises the Neon CLI resolution against real files, without a user-specific installation. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readNeonCliEntrypointFromPnpmListing, resolveNeonCliEntrypoint } from "./neon-cli-entrypoint";

const directories: string[] = [];

/** @returns A real package directory containing `dist/cli.js`, removed after the test. */
async function createInstalledCli(): Promise<{ packagePath: string; entrypoint: string }> {
  const root = await mkdtemp(join(tmpdir(), "neon-cli-entrypoint-"));
  directories.push(root);
  const packagePath = join(root, "node_modules", "neon");
  await mkdir(join(packagePath, "dist"), { recursive: true });
  const entrypoint = join(packagePath, "dist", "cli.js");
  await writeFile(entrypoint, "");
  return { packagePath, entrypoint };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Neon CLI entrypoint", () => {
  it("should read the global neon package from a pnpm listing, including Windows verbatim paths", async () => {
    const { packagePath, entrypoint } = await createInstalledCli();
    const listing = (path: string) => JSON.stringify([{ path: "global", dependencies: { pnpm: { path: "elsewhere" }, neon: { from: "neon", version: "8.8.0", path } } }]);

    await expect(readNeonCliEntrypointFromPnpmListing(listing(packagePath))).resolves.toBe(entrypoint);
    if (process.platform === "win32") await expect(readNeonCliEntrypointFromPnpmListing(listing(`\\\\?\\${packagePath}`))).resolves.toBe(entrypoint);
  });

  it("should ignore listings without an installed neon entrypoint", async () => {
    await expect(readNeonCliEntrypointFromPnpmListing(JSON.stringify([{ dependencies: { pnpm: { path: "elsewhere" } } }]))).resolves.toBeUndefined();
    await expect(readNeonCliEntrypointFromPnpmListing(JSON.stringify([{ dependencies: { neon: { path: join(tmpdir(), "missing-neon-package") } } }]))).resolves.toBeUndefined();
    await expect(readNeonCliEntrypointFromPnpmListing("not json")).resolves.toBeUndefined();
  });

  it("should prefer an explicit NEON_CLI_PATH and reject a stale one", async () => {
    const { entrypoint } = await createInstalledCli();

    await expect(resolveNeonCliEntrypoint({ NEON_CLI_PATH: entrypoint, PATH: "" })).resolves.toBe(entrypoint);
    await expect(resolveNeonCliEntrypoint({ NEON_CLI_PATH: join(tmpdir(), "missing-neon", "cli.js"), PATH: "" })).rejects.toThrow("explicit_path_missing");
  });

  it("should find an npm-style global install on PATH", async () => {
    const { entrypoint } = await createInstalledCli();
    const npmPrefix = join(entrypoint, "..", "..", "..", "..");

    await expect(resolveNeonCliEntrypoint({ PATH: npmPrefix })).resolves.toBe(entrypoint);
  });
});
