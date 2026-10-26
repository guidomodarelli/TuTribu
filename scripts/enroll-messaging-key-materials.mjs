#!/usr/bin/env node
/**
 * Enrolls the hosting HMAC keyrings (`contact_fingerprint`, `operation_payload`) in `public.messaging_key_material_proofs`.
 *
 * Usage (operators only, with the target deployment's secrets in the environment):
 *   pnpm messaging:enroll-keys
 *
 * It reads `MESSAGING_SECURITY_ENVIRONMENT`, `MESSAGING_SECURITY_EPOCH`, `MESSAGING_RECOVERY_LOCK` and
 * `MESSAGING_KEYRINGS_JSON`, and connects with `DATABASE_MAINTENANCE_URL` (then `DATABASE_MIGRATION_URL`);
 * never with the request role `DATABASE_URL`. It does not load `.env` files. It is idempotent and never
 * replaces an existing proof: an id whose material changed fails with `messaging_crypto_key_continuity_unproven`.
 * Output is one JSON line with purposes and key ids; never keys, verifiers or connection strings.
 *
 * @module enroll-messaging-key-materials
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { runnerImport } from "vite";
import { MESSAGING_KEY_ENROLLMENT_LAUNCHER as LAUNCHER } from "./constants/messaging-key-enrollment-launcher.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Loads the private enrollment module through Vite's module runner, which resolves the project aliases.
 * @returns {Promise<typeof import("../src/modules/messaging/infrastructure/operations/enroll-messaging-key-materials")>} The real server module.
 */
async function loadEnrollmentModule() {
  const { module } = await runnerImport(resolve(projectRoot, LAUNCHER.entryModule), {
    configFile: false,
    root: projectRoot,
    logLevel: "silent",
    resolve: { alias: { [LAUNCHER.projectAlias]: projectRoot, [LAUNCHER.serverOnlyModule]: LAUNCHER.serverOnlyReplacement } },
  });
  return module;
}

/**
 * Runs one enrollment and projects only safe diagnostics plus an exit code.
 * @returns {Promise<void>} After writing exactly one JSON line.
 */
async function main() {
  let enrollment;
  try {
    enrollment = await loadEnrollmentModule();
    const purposes = await enrollment.enrollHostingMessagingKeyMaterials(process.env);
    process.stdout.write(`${JSON.stringify({ operation: LAUNCHER.operation, state: LAUNCHER.completedState, purposes })}\n`);
  } catch (error) {
    const failure = enrollment ? enrollment.describeMessagingKeyEnrollmentFailure(error) : { code: LAUNCHER.unexpectedFailure };
    process.stderr.write(`${JSON.stringify({ operation: LAUNCHER.operation, ...failure })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
