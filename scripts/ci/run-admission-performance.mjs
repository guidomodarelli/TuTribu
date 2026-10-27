/** Executes real opted-in performance cases and publishes only a validated numeric artifact. @module run-admission-performance */
import { randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { ADMISSION_PERFORMANCE_ENVIRONMENT, ADMISSION_PERFORMANCE_CI, ADMISSION_PERFORMANCE_INHERITED_ENVIRONMENT, ADMISSION_PERFORMANCE_STATIC_ENVIRONMENT } from "../../tests/support/constants/admission-performance-runtime.mjs";
import { createAdmissionPerformanceReport } from "../../tests/support/admission-performance-report.mjs";

const repository = process.cwd();
const required = Object.values(ADMISSION_PERFORMANCE_ENVIRONMENT);
if (required.some((key) => !process.env[key]) || !process.env.DATABASE_URL) throw new Error("Native admission performance requires its explicit temporary project capability, two ownership nonces and database selection");
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8", windowsHide: true }).trim();
if (process.env[ADMISSION_PERFORMANCE_ENVIRONMENT.expectedCommit] !== head) throw new Error("Native admission performance requires the exact reviewed commit selected by its resource owner");
const artifactRoot = await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), ADMISSION_PERFORMANCE_CI.artifactDirectoryPrefix));
const privatePath = join(artifactRoot, ADMISSION_PERFORMANCE_CI.privateReportFile), publicPath = join(artifactRoot, ADMISSION_PERFORMANCE_CI.publicReportFile);
const environment = {};
for (const key of [...ADMISSION_PERFORMANCE_INHERITED_ENVIRONMENT, ...required]) if (process.env[key]) environment[key] = process.env[key];
Object.assign(environment, ADMISSION_PERFORMANCE_STATIC_ENVIRONMENT, { DATABASE_URL: process.env.DATABASE_URL, DATABASE_MAINTENANCE_URL: process.env.DATABASE_URL, BETTER_AUTH_SECRET: randomUUID() + randomUUID(), GOOGLE_CLIENT_ID: randomUUID(), GOOGLE_CLIENT_SECRET: randomUUID() });
let output = "", outputTruncated = false, capturedBytes = 0;
/** @param {Buffer} chunk - Private native output. @returns Nothing after bounded in-memory capture; raw logs are never streamed or uploaded. */
function capture(chunk) { const remaining = ADMISSION_PERFORMANCE_CI.maximumLogBytes - capturedBytes; if (chunk.length > remaining) outputTruncated = true; if (remaining > 0) { const accepted = chunk.subarray(0, remaining); output += accepted.toString("utf8"); capturedBytes += accepted.length; } }
try {
  const child = spawn(process.execPath, [join(repository, "node_modules/vitest/vitest.mjs"), "run", ADMISSION_PERFORMANCE_CI.testFile, "--no-file-parallelism", "--disableConsoleIntercept", "--reporter=json", "--outputFile=" + privatePath], { cwd: repository, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", capture); child.stderr.on("data", capture);
  const exitCode = await new Promise((accept, reject) => { child.once("error", reject); child.once("close", (code) => accept(code)); });
  const rawReport = JSON.parse(await readFile(privatePath, "utf8"));
  const artifact = createAdmissionPerformanceReport({ head, exitCode, outputTruncated, rawReport, output });
  await writeFile(publicPath, JSON.stringify(artifact, null, 2) + "\n");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `artifact_path=${publicPath}\n`);
  process.stdout.write(JSON.stringify(artifact) + "\n");
  process.exitCode = exitCode === 0 && !artifact.outputTruncated && artifact.cases.every((testCase) => testCase.status === "passed") && artifact.load?.p95Ms !== null && artifact.load?.networkQueryP95Ms !== null && artifact.load && artifact.abandonment?.idleGuardConfirmed ? 0 : 1;
} catch (error) {
  // Preserve the private cause in memory; public logs contain only the fixed operation context.
  const failure = new Error("Native admission performance runner could not record complete safe evidence", { cause: error });
  process.stderr.write(failure.message + "\n");
  process.exitCode = 1;
} finally {
  if (!resolve(privatePath).startsWith(resolve(artifactRoot) + sep)) throw new Error("Native admission report cleanup escaped its owned directory");
  await rm(privatePath, { force: true });
}
