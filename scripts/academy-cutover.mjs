#!/usr/bin/env node
/**
 * Per-tribe academy migration runner (operators only).
 *
 * Usage:
 *   node scripts/academy-cutover.mjs --slug <tribe> [--preflight]
 *     Dry run (default): prints the preflight report as JSON. No writes.
 *   node scripts/academy-cutover.mjs --slug <tribe> --apply <manifest.json> --confirm
 *     Applies an approved manifest in one transaction (academy_apply_cutover).
 *     Without --confirm it only validates the arguments and exits.
 *
 * It connects with the maintenance connection (DATABASE_MAINTENANCE_URL, then
 * DATABASE_MIGRATION_URL, then DATABASE_URL), because both procedures are
 * owner-only. It never calls the payment provider and never prints connection
 * strings. Never point it at production without an approved manifest built
 * from a fresh preflight (the fingerprint rejects stale manifests).
 *
 * @module academy-cutover
 */

import fs from "node:fs";
import process from "node:process";

import nextEnv from "@next/env";
import pg from "pg";

const CONNECTION_ENV_CANDIDATES = [
  "DATABASE_MAINTENANCE_URL",
  "DATABASE_MIGRATION_URL",
  "DATABASE_URL",
];

const FLAG = {
  apply: "--apply",
  confirm: "--confirm",
  preflight: "--preflight",
  slug: "--slug",
};

const EXIT_CODE = {
  failure: 1,
  usage: 2,
};

/**
 * Parses the command line into a validated command.
 *
 * @param {string[]} argumentsList - Arguments after the script path.
 * @returns {{ kind: "preflight", slug: string } | { kind: "apply", slug: string, manifestPath: string, confirmed: boolean } | { kind: "usage", message: string }}
 */
export function parseAcademyCutoverArguments(argumentsList) {
  let slug = null;
  let manifestPath = null;
  let confirmed = false;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const current = argumentsList[index];

    if (current === FLAG.slug) {
      slug = argumentsList[index + 1] ?? null;
      index += 1;
    } else if (current === FLAG.apply) {
      manifestPath = argumentsList[index + 1] ?? null;
      index += 1;
    } else if (current === FLAG.confirm) {
      confirmed = true;
    } else if (current !== FLAG.preflight) {
      return { kind: "usage", message: `Argumento desconocido: ${current}` };
    }
  }

  if (!slug || slug.startsWith("--")) {
    return { kind: "usage", message: "Falta --slug <tribu>." };
  }

  if (manifestPath !== null) {
    if (!manifestPath || manifestPath.startsWith("--")) {
      return { kind: "usage", message: "Falta la ruta del manifiesto después de --apply." };
    }

    return { confirmed, kind: "apply", manifestPath, slug };
  }

  return { kind: "preflight", slug };
}

/**
 * Picks the first configured connection string without exposing it.
 *
 * @param {Record<string, string | undefined>} environment - Process env.
 * @returns {string | null}
 */
export function resolveAcademyCutoverConnection(environment) {
  for (const name of CONNECTION_ENV_CANDIDATES) {
    const value = environment[name]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

async function main() {
  const command = parseAcademyCutoverArguments(process.argv.slice(2));

  if (command.kind === "usage") {
    console.error(command.message);
    process.exit(EXIT_CODE.usage);
  }

  nextEnv.loadEnvConfig(process.cwd());
  const connectionString = resolveAcademyCutoverConnection(process.env);

  if (!connectionString) {
    console.error("No hay conexión de mantenimiento configurada.");
    process.exit(EXIT_CODE.failure);
  }

  let manifest = null;

  if (command.kind === "apply") {
    manifest = JSON.parse(fs.readFileSync(command.manifestPath, "utf8"));

    if (!command.confirmed) {
      console.log("Manifiesto leído. Agregá --confirm para aplicarlo.");
      return;
    }
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const result =
      command.kind === "apply"
        ? await client.query("select public.academy_apply_cutover($1, $2::jsonb) as result", [
            command.slug,
            JSON.stringify(manifest),
          ])
        : await client.query("select public.academy_preflight($1) as result", [command.slug]);

    console.log(JSON.stringify(result.rows[0].result, null, 2));
  } finally {
    await client.end();
  }
}

const isDirectExecution = process.argv[1]?.endsWith("academy-cutover.mjs");

if (isDirectExecution) {
  main().catch((error) => {
    console.error("La operación de migración de academia falló:", error?.message ?? error);
    process.exit(EXIT_CODE.failure);
  });
}
