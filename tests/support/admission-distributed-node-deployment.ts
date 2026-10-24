/** Compiles and owns four private-environment deployments on one exact disposable branch. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdtemp, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { ADMISSION_NEON_PROJECT_ID } from "./constants/academy-admission-database";
import { ADMISSION_NODE_HOST } from "./constants/admission-node-host";
import { ADMISSION_DISTRIBUTED_NODE, admissionDistributedHostInputSchema, type AdmissionDistributedHostInput } from "./constants/admission-distributed-node";
import { MESSAGING_HOSTING_ENV } from "@/src/modules/messaging/constants/messaging-hosting";
import { resolveNeonCliEntrypoint } from "./neon-cli-entrypoint";

const execute = promisify(execFile);
type FunctionMetadata = { slug: string; invocation_url?: string; branch_id?: string };
type ApiBranch = { id: string; name: string; default: boolean; parent_id: string };
type EndpointMetadata = { branch_id: string; autoscaling_limit_min_cu: number; autoscaling_limit_max_cu: number; region_id: string };
type AppliedChange = { kind: string; action: string; identifier: string };
type Compiler = { version: string; build: (options: Record<string, unknown>) => Promise<{ metafile: { inputs: Record<string, unknown> } }> };
export type AdmissionDistributedSourceInput = { path: string; sha256: string };
export type AdmissionDistributedFunction = { nodeIndex: number; slug: string; url: URL };
/** Public resource identity only; private inputs remain inside closure-scoped process environment. */
export type AdmissionDistributedNodeDeployment = {
  hosts: AdmissionDistributedFunction[]; directory: string; sourceCommit: string; bundleSha256: string; compilerVersion: string;
  sourceInputs: AdmissionDistributedSourceInput[]; compute: { minimum: number; maximum: number; region: string };
  assertInputsUnchanged: () => Promise<void>; assertPrivateMaterialAbsent: () => Promise<void>; remove: () => Promise<void>;
};

/**
 * Deploys only new function names on a verified child, without secrets in arguments or dotenv files.
 * @param branch - Exact capability returned by the native branch owner.
 * @param operationId - Fixed durable cohort, never selected by an HTTP caller.
 * @param token - Private random bearer, retained only in memory for authentication and leak checks.
 * @param hostingEnvironment - Original purpose-separated synthetic settings shared by the hosts.
 * @param inputs - Four disjoint, server-selected actor partitions.
 * @param expectedComputeUnits - Capacity already selected by the branch owner.
 * @returns Public deployment identities and cleanup restricted to their original branch and names.
 */
export async function deployAdmissionDistributedNodes(branch: AcademyAdmissionTestDatabase["branch"], operationId: string, token: string, hostingEnvironment: Record<string, string>, inputs: readonly AdmissionDistributedHostInput[], expectedComputeUnits: number): Promise<AdmissionDistributedNodeDeployment> {
  const cli = await resolveNeonCliEntrypoint();
  if (inputs.length !== ADMISSION_DISTRIBUTED_NODE.functionCount || inputs.some((input, index) => admissionDistributedHostInputSchema.parse(input).nodeIndex !== index)) throw new Error("AdmissionDistributedDeployment.prepare failed: inconsistent_host_inputs");
  if (Object.values(MESSAGING_HOSTING_ENV).some((name) => !hostingEnvironment[name]) || Object.keys(hostingEnvironment).some((name) => !Object.values<string>(MESSAGING_HOSTING_ENV).includes(name))) throw new Error("AdmissionDistributedDeployment.prepare failed: closed_hosting_environment_required");
  const workspace = process.cwd(), gitDirectory = (await execute("git", ["rev-parse", "--git-common-dir"], { windowsHide: true })).stdout.trim();
  const directory = await mkdtemp(join(resolve(workspace, gitDirectory), ADMISSION_DISTRIBUTED_NODE.bundleDirectoryPrefix));
  const sourceCommit = (await execute("git", ["rev-parse", "HEAD"], { windowsHide: true })).stdout.trim();
  const scope = ["--project-id", ADMISSION_NEON_PROJECT_ID, "--branch", branch.id, "--profile", ADMISSION_DISTRIBUTED_NODE.cliProfile, "--output", "json"];
  const keyringsJson = hostingEnvironment[MESSAGING_HOSTING_ENV.keyrings];
  const keyrings = JSON.parse(keyringsJson) as Record<string, { keys: { materialBase64: string }[] }>;
  const protectedValues = [token, keyringsJson, ...Object.values(keyrings).flatMap((keyring) => keyring.keys.map((key) => key.materialBase64))];
  const childEnvironment: NodeJS.ProcessEnv = { ...process.env };
  /** Executes the official manager without exposing private stdout or credentials in arguments. */
  async function command(argumentsList: string[]): Promise<unknown> {
    if (argumentsList.some((argument) => protectedValues.some((value) => argument.includes(value)))) throw new Error("AdmissionDistributedDeployment.command failed: private_argument_rejected");
    const commandScope = argumentsList[0] === "api" ? ["--profile", ADMISSION_DISTRIBUTED_NODE.cliProfile, "--output", "json"] : scope;
    const result = await execute(process.execPath, [cli!, ...argumentsList, ...commandScope], { cwd: directory, env: childEnvironment, windowsHide: true, timeout: ADMISSION_NODE_HOST.deploymentTimeoutMs, maxBuffer: 2_000_000 });
    return result.stdout.trim() ? JSON.parse(result.stdout) as unknown : null;
  }
  /** Reads only original branch metadata before any deployment or removal. */
  async function assertBranchScope() {
    const result = await command(["api", `/projects/${ADMISSION_NEON_PROJECT_ID}/branches/${branch.id}`, "--method", "GET"]) as { branch: ApiBranch };
    if (branch.isDefault !== false || result.branch.id !== branch.id || result.branch.name !== branch.name || result.branch.parent_id !== branch.parentId || result.branch.default !== false) throw new Error("AdmissionDistributedDeployment.prepare failed: branch_ownership_unproven");
  }
  await assertBranchScope();
  const endpoints = await command(["api", `/projects/${ADMISSION_NEON_PROJECT_ID}/endpoints`, "--method", "GET"]) as { endpoints: EndpointMetadata[] };
  const endpoint = endpoints.endpoints.find((item) => item.branch_id === branch.id);
  if (!endpoint || endpoint.autoscaling_limit_min_cu !== expectedComputeUnits || endpoint.autoscaling_limit_max_cu !== expectedComputeUnits) throw new Error("AdmissionDistributedDeployment.prepare failed: compute_capacity_unproven");
  const compute = { minimum: endpoint.autoscaling_limit_min_cu, maximum: endpoint.autoscaling_limit_max_cu, region: endpoint.region_id };
  const require = createRequire(cli), compiler = require("esbuild") as Compiler;
  const built = await compiler.build({ absWorkingDir: workspace, entryPoints: [join(workspace, ADMISSION_DISTRIBUTED_NODE.entrypoint)], outfile: join(directory, "index.mjs"), bundle: true, platform: "node", format: "esm", target: "node24", conditions: ["react-server"], external: ["pg-native"], tsconfig: join(workspace, "tsconfig.json"), alias: { "server-only": join(workspace, "node_modules/next/dist/compiled/server-only/empty.js") }, banner: { js: "import {createRequire as __admissionCreateRequire} from 'node:module';const require=__admissionCreateRequire(import.meta.url);" }, metafile: true, logLevel: "silent" });
  const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
  const bundleSha256 = digest(await readFile(join(directory, "index.mjs")));
  const inputPaths = [...new Set([...Object.keys(built.metafile.inputs).map((path) => resolve(workspace, path)), ...[ADMISSION_DISTRIBUTED_NODE.supportMigration, ADMISSION_DISTRIBUTED_NODE.coordinator, ADMISSION_DISTRIBUTED_NODE.testFile].map((path) => join(workspace, path))])].sort();
  const snapshot = () => Promise.all(inputPaths.map(async (path) => ({ path: relative(workspace, path).replaceAll("\\", "/"), sha256: digest(await readFile(path)) })));
  const sourceInputs = await snapshot();
  const suffix = randomUUID().replaceAll("-", "").slice(0, ADMISSION_DISTRIBUTED_NODE.functionNonceCharacters);
  const slugs = inputs.map((input) => `${ADMISSION_DISTRIBUTED_NODE.functionSlugPrefix}${suffix}${input.nodeIndex}`);
  /** Consumes minimal provider metadata without validating provider DTOs as application payloads. */
  async function functions(): Promise<FunctionMetadata[]> {
    const result = await command(["functions", "list"]);
    return (Array.isArray(result) ? result : (result as { functions?: FunctionMetadata[] } | null)?.functions ?? []) as FunctionMetadata[];
  }
  if ((await functions()).some((item) => slugs.includes(item.slug))) throw new Error("AdmissionDistributedDeployment.prepare failed: existing_function_name");
  const expiresAt = String(Date.now() + ADMISSION_NODE_HOST.capabilityLifetimeMs), tokenSha256 = digest(token);
  const definitions = inputs.map((input) => {
    const environment = { ...hostingEnvironment, [ADMISSION_DISTRIBUTED_NODE.privateInputVariable]: JSON.stringify(input), [ADMISSION_NODE_HOST.branchVariable]: branch.name, [ADMISSION_NODE_HOST.operationVariable]: operationId, [ADMISSION_NODE_HOST.tokenDigestVariable]: tokenSha256, [ADMISSION_NODE_HOST.expiresVariable]: expiresAt, [ADMISSION_NODE_HOST.sourceCommitVariable]: sourceCommit, [ADMISSION_NODE_HOST.bundleDigestVariable]: bundleSha256 };
    const entries = Object.entries(environment).map(([name, value], variableIndex) => {
      const alias = `${ADMISSION_DISTRIBUTED_NODE.environmentAliasPrefix}${input.nodeIndex}_${variableIndex}`;
      childEnvironment[alias] = value;
      return `${JSON.stringify(name)}:process.env[${JSON.stringify(alias)}]!`;
    });
    return `${JSON.stringify(slugs[input.nodeIndex])}:{name:'Owned admission shard ${input.nodeIndex}',source:'.',bundler:'none',env:{${entries.join(",")}}}`;
  });
  const configPath = join(directory, ADMISSION_DISTRIBUTED_NODE.configFilename), configModule = require.resolve(ADMISSION_DISTRIBUTED_NODE.configPackage).replaceAll("\\", "/");
  await writeFile(configPath, `import {defineConfig} from ${JSON.stringify(configModule)};export default defineConfig({functions:{${definitions.join(",")}}});\n`);
  /** @returns After all exact own function names are absent, without touching another name. */
  async function remove() {
    await assertBranchScope();
    const failures: unknown[] = [];
    for (const slug of slugs) {
      try { if ((await functions()).some((item) => item.slug === slug)) await command(["functions", "delete", slug]); }
      catch (error) { failures.push(error); }
    }
    if (failures.length || (await functions()).some((item) => slugs.includes(item.slug))) throw new AggregateError(failures, "AdmissionDistributedDeployment.cleanup failed: function_removal_unconfirmed");
  }
  /** @returns After every original compilation input is still byte-identical. */
  async function assertInputsUnchanged() { if (JSON.stringify(await snapshot()) !== JSON.stringify(sourceInputs)) throw new Error("AdmissionDistributedDeployment.verify failed: compilation_inputs_changed"); }
  /** @returns After checking the bearer and individual synthetic keys in this owner's files only. */
  async function assertPrivateMaterialAbsent() {
    const scan = async (current: string): Promise<void> => {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isSymbolicLink()) throw new Error("AdmissionDistributedDeployment.verify failed: unexpected_symbolic_link");
        if (entry.isDirectory()) await scan(path);
        else if (entry.isFile()) { const content = (await readFile(path, "utf8")).replaceAll("\\/", "/"); if (protectedValues.some((value) => content.includes(value))) throw new Error("AdmissionDistributedDeployment.verify failed: private_material_persisted"); }
      }
    };
    await scan(directory);
  }
  try {
    const plan = await command(["config", "plan", "--config", configPath]) as { applied: AppliedChange[]; conflicts: unknown[] };
    if (plan.conflicts.length || plan.applied.length !== inputs.length + 1 || plan.applied.some((change) => !(change.kind === "branch" && change.action === "noop" && change.identifier === branch.name || change.kind === "service" && change.action === "create" && slugs.some((slug) => change.identifier === `function:${slug}`)))) throw new Error("AdmissionDistributedDeployment.deploy failed: unrelated_plan_rejected");
    await command(["deploy", "--config", configPath, "--no-env-pull"]);
    const hosts: AdmissionDistributedFunction[] = [];
    for (const [nodeIndex, slug] of slugs.entries()) {
      const response = await command(["functions", "get", slug]) as FunctionMetadata | { function: FunctionMetadata };
      const metadata = "function" in response ? response.function : response;
      const url = new URL(metadata.invocation_url ?? "");
      if (url.protocol !== "https:" || !url.hostname.includes(branch.id) || metadata.branch_id !== undefined && metadata.branch_id !== branch.id) throw new Error("AdmissionDistributedDeployment.deploy failed: invocation_scope_mismatch");
      hosts.push({ nodeIndex, slug, url });
    }
    return { hosts, directory, sourceCommit, bundleSha256, compilerVersion: compiler.version, sourceInputs, compute, assertInputsUnchanged, assertPrivateMaterialAbsent, remove };
  } catch (error) {
    try { await remove(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "AdmissionDistributedDeployment.deploy failed: cleanup_unconfirmed", { cause: error }); }
    throw new Error("AdmissionDistributedDeployment.deploy failed: owned_functions_unavailable", { cause: error });
  }
}
