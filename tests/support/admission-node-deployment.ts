/** Owns compilation and one branch-scoped native Node deployment without uploading private capabilities. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { ADMISSION_NEON_PROJECT_ID } from "./constants/academy-admission-database";
import { ADMISSION_NODE_HOST } from "./constants/admission-node-host";
import { ADMISSION_CPU_PROFILE } from "./constants/admission-cpu-profile";
import { ADMISSION_SAMPLE } from "./constants/admission-sample";
import { ADMISSION_DATABASE_OBSERVATION } from "./constants/admission-database-observation";
import { resolveNeonCliEntrypoint } from "./neon-cli-entrypoint";

const execute = promisify(execFile);
/** Provider fields consumed only after exact branch selection; no provider DTO schema validation. */
type FunctionMetadata = { slug: string; invocation_url?: string; branch_id?: string };
/** Holds only public deployment identity and a cleanup operation bound to the original branch. */
export type AdmissionNodeDeployment = { url: URL; slug: string; bundleSha256: string; sourceCommit: string; directory: string; compute: { minimum: number; maximum: number; region: string }; remove: () => Promise<void> };

/** Branch descriptor accepted at runtime; a default branch is rejected even though owned fixtures never produce one. */
type OwnedBranchDescriptor = Omit<AcademyAdmissionTestDatabase["branch"], "isDefault"> & { isDefault: boolean };
/**
 * Compiles the existing application modules for the Node server condition and deploys only to its owned child.
 * @param branch - Capability returned by the disposable-branch owner.
 * @param operationId - Fixed prepared durable invocation.
 * @param tokenSha256 - Hash of the random capability; the private token never reaches CLI arguments or source.
 * @param expectedComputeUnits - Capacity selected for this owned experimental endpoint only.
 * @returns Public invocation identity and exact resource cleanup.
 */
export async function deployAdmissionNodeHost(branch: OwnedBranchDescriptor, operationId: string, tokenSha256: string, expectedComputeUnits: number = ADMISSION_NODE_HOST.computeUnits): Promise<AdmissionNodeDeployment> {
  const cli = await resolveNeonCliEntrypoint();
  const workspace = process.cwd();
  const gitRoot = (await execute("git", ["rev-parse", "--git-common-dir"], { cwd: workspace, windowsHide: true })).stdout.trim();
  const directory = await mkdtemp(join(resolve(workspace, gitRoot), ADMISSION_NODE_HOST.bundleDirectoryPrefix));
  const sourceCommit = (await execute("git", ["rev-parse", "HEAD"], { cwd: workspace, windowsHide: true })).stdout.trim();
  const scope = ["--project-id", ADMISSION_NEON_PROJECT_ID, "--branch", branch.id, "--profile", "DEFAULT", "--output", "json"];
  /** @param argumentsList - Structured function arguments containing only public metadata. @returns Consumed private provider response without logging. */
  async function command(argumentsList: string[]) {
    const result = await execute(process.execPath, [cli, "functions", ...argumentsList, ...scope], { cwd: workspace, windowsHide: true, timeout: ADMISSION_NODE_HOST.deploymentTimeoutMs, maxBuffer: 2_000_000 });
    return result.stdout.trim() ? JSON.parse(result.stdout) as unknown : null;
  }
  /** @returns Current function metadata for this exact branch only. */
  async function functions(): Promise<FunctionMetadata[]> {
    const result = await command(["list"]);
    return Array.isArray(result) ? result as FunctionMetadata[] : (result as { functions?: FunctionMetadata[] } | null)?.functions ?? [];
  }
  const identity = JSON.parse((await execute(process.execPath, [cli, "api", `/projects/${ADMISSION_NEON_PROJECT_ID}/branches/${branch.id}`, "--profile", "DEFAULT", "--output", "json", "--method", "GET"], { windowsHide: true, timeout: ADMISSION_NODE_HOST.deploymentTimeoutMs })).stdout) as { branch: { id: string; name: string; default?: boolean; parent_id: string } };
  if (branch.isDefault || identity.branch.id !== branch.id || identity.branch.name !== branch.name || identity.branch.parent_id !== branch.parentId || identity.branch.default !== false) throw new Error("AdmissionNodeDeployment.prepare failed: branch_ownership_unproven");
  const endpoints = JSON.parse((await execute(process.execPath, [cli, "api", `/projects/${ADMISSION_NEON_PROJECT_ID}/endpoints`, "--profile", "DEFAULT", "--output", "json", "--method", "GET"], { windowsHide: true, timeout: ADMISSION_NODE_HOST.deploymentTimeoutMs })).stdout) as { endpoints: { branch_id: string; autoscaling_limit_min_cu: number; autoscaling_limit_max_cu: number; region_id: string }[] };
  const endpoint = endpoints.endpoints.find((item) => item.branch_id === branch.id);
  if (endpoint?.autoscaling_limit_min_cu !== expectedComputeUnits || endpoint.autoscaling_limit_max_cu !== expectedComputeUnits) throw new Error("AdmissionNodeDeployment.prepare failed: native_compute_capacity_unproven");
  const compute = { minimum: endpoint.autoscaling_limit_min_cu, maximum: endpoint.autoscaling_limit_max_cu, region: endpoint.region_id };
  const compiler = createRequire(cli)("esbuild") as { version: string; build: (options: Record<string, unknown>) => Promise<{ metafile: unknown }> };
  const built = await compiler.build({
    entryPoints: [join(workspace, "tests/runtime/admission-node-host/index.ts")], outfile: join(directory, "index.mjs"), bundle: true,
    platform: "node", format: "esm", target: "node24", conditions: ["react-server"], external: ["pg-native"], tsconfig: join(workspace, "tsconfig.json"),
    // Next's server-only marker has no runtime code in a server build, as in the existing Vitest adapter.
    alias: { "server-only": join(workspace, "node_modules/next/dist/compiled/server-only/empty.js") },
    banner: { js: "import { createRequire as __admissionCreateRequire } from 'node:module'; const require = __admissionCreateRequire(import.meta.url);" },
    metafile: true, logLevel: "silent",
  });
  const bundleSha256 = createHash("sha256").update(await readFile(join(directory, "index.mjs"))).digest("hex");
  await writeFile(join(directory, "build-metadata.json"), JSON.stringify({ sourceCommit, bundleSha256, compilerVersion: compiler.version, metafile: built.metafile }, null, 2));
  const slug = ADMISSION_NODE_HOST.functionSlugPrefix + randomUUID().replaceAll("-", "").slice(0, 12);
  if ((await functions()).some((item) => item.slug === slug)) throw new Error("AdmissionNodeDeployment.prepare failed: existing_function_name");
  /** @returns After its original function is absent, without touching another slug or branch. */
  async function remove() {
    if ((await functions()).some((item) => item.slug === slug)) await command(["delete", slug]);
    if ((await functions()).some((item) => item.slug === slug)) throw new Error("AdmissionNodeDeployment.cleanup failed: function_removal_unconfirmed");
  }
  try {
    const environment = {
      [ADMISSION_NODE_HOST.branchVariable]: branch.name, [ADMISSION_NODE_HOST.operationVariable]: operationId, [ADMISSION_NODE_HOST.tokenDigestVariable]: tokenSha256,
      [ADMISSION_NODE_HOST.expiresVariable]: String(Date.now() + ADMISSION_NODE_HOST.capabilityLifetimeMs), [ADMISSION_NODE_HOST.sourceCommitVariable]: sourceCommit, [ADMISSION_NODE_HOST.bundleDigestVariable]: bundleSha256,
      ...(process.env[ADMISSION_CPU_PROFILE.environmentVariable] === ADMISSION_CPU_PROFILE.enabledValue ? { [ADMISSION_CPU_PROFILE.environmentVariable]: ADMISSION_CPU_PROFILE.enabledValue } : {}),
      ...(process.env[ADMISSION_NODE_HOST.poolMaximumVariable] !== undefined ? { [ADMISSION_NODE_HOST.poolMaximumVariable]: process.env[ADMISSION_NODE_HOST.poolMaximumVariable]! } : {}),
      ...(process.env[ADMISSION_SAMPLE.environmentVariable] === ADMISSION_SAMPLE.enabledValue ? { [ADMISSION_SAMPLE.environmentVariable]: ADMISSION_SAMPLE.enabledValue } : {}),
      ...(process.env[ADMISSION_DATABASE_OBSERVATION.environmentVariable] === ADMISSION_DATABASE_OBSERVATION.enabledValue ? { [ADMISSION_DATABASE_OBSERVATION.environmentVariable]: ADMISSION_DATABASE_OBSERVATION.enabledValue } : {}),
    };
    await command(["deploy", slug, "--src", directory, "--no-bundle", "--runtime", "nodejs24", ...Object.entries(environment).flatMap(([name, value]) => ["--env", `${name}=${value}`])]);
    const response = await command(["get", slug]) as FunctionMetadata | { function: FunctionMetadata };
    const metadata = "function" in response ? response.function : response;
    const url = new URL(metadata.invocation_url ?? "");
    if (url.protocol !== "https:" || !url.hostname.includes(branch.id)) throw new Error("AdmissionNodeDeployment.prepare failed: invocation_scope_mismatch");
    return { url, slug, bundleSha256, sourceCommit, directory, compute, remove };
  } catch (error) {
    try { await remove(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "AdmissionNodeDeployment.deploy failed: cleanup_unconfirmed", { cause: error }); }
    throw new Error("AdmissionNodeDeployment.deploy failed: native_deployment_unavailable", { cause: error });
  }
}
