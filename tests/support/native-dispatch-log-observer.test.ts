/** @vitest-environment node */
/** Exercises actual observer output with leaking inputs without exposing its generated canaries to artifacts. @module native-dispatch-log-observer-tests */
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("should retain only redacted fields and a leak flag when the actual observed reporter JSON contains private canaries", async () => {
  const credential = randomUUID(), canary = randomUUID();
  const directory = await mkdtemp(join(tmpdir(), "admission-observer-")), outputPath = join(directory, "observed.jsonl");
  try {
  await writeFile(outputPath, "", "utf8");
  const script = "console.error(JSON.stringify({level:'error',feature:'academy-admissions',operation:'admission-contact-dispatch',requestId:process.env.ADMISSION_TEST_DISPATCH_LOG_CANARY,traceId:'safe-trace',message:process.env.ADMISSION_TEST_ZAVU_CREDENTIAL,metadata:{stage:'complete',code:'operation_unresolved',deliveryId:process.env.ADMISSION_TEST_ZAVU_CREDENTIAL,attemptId:'safe-attempt',[process.env.ADMISSION_TEST_DISPATCH_LOG_CANARY]:'hidden'},error:{message:process.env.ADMISSION_TEST_DISPATCH_LOG_CANARY}}));console.error(process.env.ADMISSION_TEST_ZAVU_CREDENTIAL);console.error(new Error(process.env.ADMISSION_TEST_DISPATCH_LOG_CANARY));console.error({privateValue:process.env.ADMISSION_TEST_ZAVU_CREDENTIAL});";
  const result = await promisify(execFile)(process.execPath, ["--import", pathToFileURL(join(process.cwd(), "tests/support/native-dispatch-log-observer.mjs")).href, "--input-type=module", "-e", script], { windowsHide: true, timeout: 10_000, env: { ...process.env, ADMISSION_TEST_DISPATCH_LOG_OUTPUT: outputPath, ADMISSION_TEST_ZAVU_CREDENTIAL: credential, ADMISSION_TEST_DISPATCH_LOG_CANARY: canary } });
  const contents = await readFile(outputPath, "utf8"), entry = JSON.parse(contents.trim()) as { privateMaterialDetected: boolean; hasError: boolean; requestId: string; message: string; metadata: { deliveryId: string }; metadataFields: string[] };
  expect(entry).toMatchObject({ privateMaterialDetected: true, hasError: true, requestId: "[redacted]", message: "[redacted]", metadata: { deliveryId: "[redacted]" } });
  expect(entry.metadataFields).toContain("[redacted]");
  expect([credential, canary].some((privateValue) => `${contents}${result.stdout}${result.stderr}`.includes(privateValue))).toBe(false);
  } finally {
    await rm(outputPath, { force: true });
    await rmdir(directory);
  }
});
