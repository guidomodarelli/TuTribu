#!/usr/bin/env node
/**
 * Starts the local dev server the way `AGENTS.md` mandates: restarts the
 * portless proxy with HTTPS on the `tutribu.app` TLD, checks that
 * `dev.tutribu.app` resolves to loopback and that the portless CA is trusted,
 * then runs `next dev` through portless so the app is served at
 * `https://dev.tutribu.app`.
 *
 * Usage:
 *   npm run dev [-- --dry-run]
 *   node scripts/dev-portless.mjs [--dry-run]
 *
 * `--dry-run` prints every step and the current machine state without
 * touching the proxy or the trust store.
 *
 * The hosts file is never written: `dev.tutribu.app` resolves to `127.0.0.1`
 * through a public DNS record (an `A` record, DNS only, in the `tutribu.app`
 * zone) and portless runs with hosts sync disabled. On Windows `portless trust`
 * uses the current user's store; the only elevated step is optional: when the
 * network's DNS does not return the record but Cloudflare's public DNS does
 * (ISP rebinding protection or a cached negative answer), the script asks
 * through UAC to point the connected physical adapters at Cloudflare's DNS and
 * clears the DNS cache. Once that is done the record resolves locally and the
 * prompt never shows again. On macOS and Linux the HTTPS proxy listens on
 * the default port 443, so `portless proxy start` asks for `sudo` once to bind it. Requires portless
 * 0.15.5 or newer (`PORTLESS_MIN_VERSION`), the first release that accepts a
 * dotted TLD; the script checks it before stopping the running proxy.
 * Every step is idempotent, so the script can be rerun freely.
 *
 * @module dev-portless
 */

import { spawn, spawnSync } from "node:child_process";
import { lookup, Resolver } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Portless route and TLD the local environment is configured for: `dev.tutribu.app`. */
const PORTLESS_DEV = {
  appName: "dev",
  tld: "tutribu.app",
};

/** Addresses the dev host may resolve to: IPv4 and IPv6 loopback. */
const LOOPBACK_ADDRESSES = ["127.0.0.1", "::1"];

/** Result of resolving the dev host before starting the server. */
const DEV_HOST_RESOLUTION = {
  loopback: "loopback",
  elsewhere: "elsewhere",
  missing: "missing",
};

/**
 * Cloudflare's public resolvers: queried to tell a missing record apart from a
 * local resolver that hides it, and set on the adapters when that happens.
 */
const PUBLIC_DNS_SERVERS = {
  ipv4: ["1.1.1.1", "1.0.0.1"],
  ipv6: ["2606:4700:4700::1111", "2606:4700:4700::1001"],
};

/** Single short attempt so a blocked public resolver does not stall the start. */
const PUBLIC_DNS_QUERY = {
  timeoutMs: 3000,
  tries: 1,
};

/** Files portless keeps under its state directory. */
const PORTLESS_STATE = {
  directoryName: ".portless",
  trustedMarkerFile: "ca.trusted",
};

/**
 * Environment for every portless invocation: the hosts file stays untouched,
 * because public DNS already resolves the dev host to loopback and writing the
 * hosts file would need administrator privileges.
 */
const PORTLESS_ENVIRONMENT = {
  PORTLESS_SYNC_HOSTS: "0",
};

/**
 * Oldest portless release that accepts a multi-segment TLD such as
 * `tutribu.app`; older releases reject `--tld tutribu.app` when the proxy starts.
 */
const PORTLESS_MIN_VERSION = "0.15.5";

/**
 * HTTPS port the proxy must bind. Passing it explicitly makes `portless proxy
 * start` fail when it cannot bind it (for example when `sudo` is denied),
 * instead of silently falling back to port 1355 and leaving
 * `https://dev.tutribu.app` unreachable.
 */
const PORTLESS_HTTPS_PORT = "443";

/** First `X.Y.Z` triple in the `portless --version` output. */
const SEMANTIC_VERSION_PATTERN = /(\d+)\.(\d+)\.(\d+)/;

const PORTLESS_BINARY = "portless";
const DEV_SERVER_COMMAND = ["next", "dev"];
const DRY_RUN_FLAG = "--dry-run";
const WINDOWS_PLATFORM = "win32";
const POWERSHELL_BINARY = "powershell.exe";
/** `-EncodedCommand` expects the script as base64 of its UTF-16LE bytes. */
const POWERSHELL_ENCODED_COMMAND_ENCODING = "utf16le";
const EXIT_CODE = {
  failure: 1,
  success: 0,
};

const SCRIPT_MESSAGE = {
  caAlreadyTrusted: "CA de portless ya confiable, no hace falta portless trust.",
  caTrust: "Registrando la CA de portless en el almacén de certificados del usuario...",
  devHostElsewhere: (hostName, addresses) =>
    `${hostName} resuelve a ${addresses.join(", ")} y no a loopback. Revisá el registro A de ${hostName}: tiene que apuntar a 127.0.0.1 en modo DNS only (sin proxy de Cloudflare).`,
  devHostLoopback: (hostName) => `${hostName} resuelve a loopback por DNS.`,
  devHostMissing: (hostName) =>
    `${hostName} no resuelve. Creá en Cloudflare un registro A "dev" → 127.0.0.1 en la zona tutribu.app, en modo DNS only (sin proxy), y volvé a correr el comando.`,
  dnsSwitchFailed:
    "No se pudo cambiar el DNS (¿cancelaste el UAC?). Cambiá el DNS del adaptador a 1.1.1.1 a mano o esperá a que el DNS de tu red resuelva el registro.",
  dnsSwitchPlanned:
    "En modo real se pediría permiso de administrador (UAC) para usar el DNS de Cloudflare en los adaptadores conectados.",
  dnsSwitchRequest: (hostName) =>
    `${hostName} existe en el DNS público pero el DNS de tu red no lo resuelve. Pidiendo permiso de administrador (UAC) para usar el DNS de Cloudflare (1.1.1.1) en los adaptadores conectados...`,
  dryRunHeader: "Modo --dry-run: no se ejecuta nada, solo se muestra el plan.",
  portlessMissing:
    "portless no está instalado. Instalalo con: npm install -g portless",
  portlessVersionUnsupported: (versionText) =>
    `portless ${versionText || "(versión ilegible)"} no soporta el TLD con punto tutribu.app: hace falta la ${PORTLESS_MIN_VERSION} o superior. Actualizalo con: npm install -g portless@latest`,
  pendingMigrations: (databaseHost, tags) =>
    `La base ${databaseHost} tiene ${tags.length} migración(es) sin aplicar (${tags.join(", ")}): las funciones y restricciones nuevas no existen ahí y sus flujos van a fallar. Aplicalas con \`pnpm db:sandbox\` en tu sandbox (o \`pnpm run db:migrate\` solo por pedido explícito).`,
  pendingMigrationsUnknown: (reason) => `No se pudo verificar si la base tiene migraciones pendientes: ${reason}.`,
  proxyStartFailed: "No se pudo iniciar el proxy de portless.",
  ready: (hostName) => `Listo: la app se sirve en https://${hostName}`,
  step: (description) => `→ ${description}`,
};

/**
 * Describes the pending-migrations check for the developer; the dev server still starts.
 *
 * @param {{ status: string, pending: string[], target: string | null, reason: string | null }} result - Result of `checkPendingMigrations`.
 * @param {{ pending: string, unknown: string }} statuses - `MIGRATION_STATUS` values.
 * @returns {string | null} Warning text, or `null` when the database is up to date.
 */
export function describePendingMigrations(result, statuses) {
  if (result.status === statuses.pending) {
    return SCRIPT_MESSAGE.pendingMigrations(result.target ?? "configurada", result.pending);
  }

  if (result.status === statuses.unknown) {
    return SCRIPT_MESSAGE.pendingMigrationsUnknown(result.reason ?? "motivo desconocido");
  }

  return null;
}

/**
 * Warns when the configured database lags behind `database/migrations/`, which otherwise shows up later as a 500 from a
 * missing function or constraint. It never blocks the dev server.
 *
 * @returns {Promise<void>}
 */
async function warnAboutPendingMigrations() {
  const { MIGRATION_JOURNAL_PATH, MIGRATION_STATUS, checkPendingMigrations, parseMigrationJournal } = await import("./release/pending-migrations.mjs");
  const repositoryRoot = process.cwd();
  const journalEntries = parseMigrationJournal(readFileSync(path.join(repositoryRoot, MIGRATION_JOURNAL_PATH), "utf8"));
  const warning = describePendingMigrations(await checkPendingMigrations({ journalEntries, repositoryRoot }), MIGRATION_STATUS);

  if (warning) {
    console.warn(warning);
  }
}

/**
 * Builds the host name portless publishes for the dev route.
 *
 * @param {{ appName: string, tld: string }} [options]
 * @returns {string}
 */
export function buildDevHostName(options = PORTLESS_DEV) {
  return `${options.appName}.${options.tld}`;
}

/**
 * Builds the portless invocations the script runs, in execution order.
 *
 * @param {{ appName: string, tld: string }} [options]
 * @returns {{
 *   proxyStop: { commandArguments: string[], description: string },
 *   proxyStart: { commandArguments: string[], description: string },
 *   runDevServer: { commandArguments: string[], description: string },
 * }}
 */
export function buildPortlessCommands(options = PORTLESS_DEV) {
  return {
    proxyStart: {
      commandArguments: [
        "proxy",
        "start",
        "--https",
        "--port",
        PORTLESS_HTTPS_PORT,
        "--tld",
        options.tld,
      ],
      description: `Iniciar el proxy de portless con HTTPS en el puerto ${PORTLESS_HTTPS_PORT} y TLD .${options.tld}`,
    },
    proxyStop: {
      commandArguments: ["proxy", "stop"],
      description: "Detener el proxy de portless si estaba corriendo",
    },
    runDevServer: {
      commandArguments: [
        "run",
        "--name",
        options.appName,
        ...DEV_SERVER_COMMAND,
      ],
      description: `Levantar next dev a través de portless como ${buildDevHostName(options)}`,
    },
  };
}

/**
 * Classifies the addresses the dev host resolved to: every address must be
 * loopback for the browser to reach the local portless proxy.
 *
 * @param {string[]} addresses - Addresses returned by DNS, empty when the name does not resolve.
 * @returns {"loopback" | "elsewhere" | "missing"}
 */
export function classifyDevHostResolution(addresses) {
  if (addresses.length === 0) {
    return DEV_HOST_RESOLUTION.missing;
  }

  return addresses.every((address) => LOOPBACK_ADDRESSES.includes(address))
    ? DEV_HOST_RESOLUTION.loopback
    : DEV_HOST_RESOLUTION.elsewhere;
}

/**
 * Decides whether to point the adapters at public DNS: only on Windows, and
 * only when the record already resolves to loopback publicly but the local
 * resolver misses it. A missing or wrong public record is fixed in Cloudflare,
 * not on this machine, and a host that already resolves needs nothing.
 *
 * @param {{
 *   platform: string,
 *   localResolution: "loopback" | "elsewhere" | "missing",
 *   publicResolution: "loopback" | "elsewhere" | "missing",
 * }} options
 * @returns {boolean}
 */
export function shouldSwitchToPublicDns({
  platform,
  localResolution,
  publicResolution,
}) {
  return (
    platform === WINDOWS_PLATFORM &&
    localResolution !== DEV_HOST_RESOLUTION.loopback &&
    publicResolution === DEV_HOST_RESOLUTION.loopback
  );
}

/**
 * Parses the first `X.Y.Z` version in a text into its numeric parts.
 *
 * @param {string} versionText - Raw output of `portless --version`.
 * @returns {number[] | null} `[major, minor, patch]`, or `null` when the text has no version.
 */
function parseSemanticVersion(versionText) {
  const versionMatch = SEMANTIC_VERSION_PATTERN.exec(versionText);

  return versionMatch ? versionMatch.slice(1).map(Number) : null;
}

/**
 * Checks whether the installed portless accepts the dotted `tutribu.app` TLD,
 * comparing its version numerically against `PORTLESS_MIN_VERSION`.
 *
 * @param {string} versionText - Raw output of `portless --version`.
 * @returns {boolean} `false` for older releases and for output without a readable version.
 */
export function isPortlessVersionSupported(versionText) {
  const installedVersion = parseSemanticVersion(versionText);

  if (!installedVersion) {
    return false;
  }

  const minimumVersion = parseSemanticVersion(PORTLESS_MIN_VERSION);

  for (let index = 0; index < minimumVersion.length; index += 1) {
    if (installedVersion[index] !== minimumVersion[index]) {
      return installedVersion[index] > minimumVersion[index];
    }
  }

  return true;
}

/**
 * Resolves the directory where portless keeps its CA and proxy state.
 *
 * @param {string} homeDirectory
 * @returns {string}
 */
export function resolvePortlessStateDirectory(homeDirectory) {
  return path.join(homeDirectory, PORTLESS_STATE.directoryName);
}

/**
 * Portless writes `ca.trusted` after a successful `portless trust`; its
 * presence is the signal that the local CA is already in the trust store.
 *
 * @param {string} stateDirectory
 * @returns {boolean}
 */
export function isPortlessCaTrusted(stateDirectory) {
  return existsSync(path.join(stateDirectory, PORTLESS_STATE.trustedMarkerFile));
}

/**
 * Parses the CLI flags the script understands.
 *
 * @param {string[]} [scriptArguments]
 * @returns {{ isDryRun: boolean }}
 */
export function normalizeScriptArguments(scriptArguments = []) {
  return {
    isDryRun: scriptArguments.includes(DRY_RUN_FLAG),
  };
}

/**
 * Builds the spawn invocation for a portless command. The npm shim on Windows
 * is a `.cmd` file, which Node refuses to spawn without a shell, so there the
 * whole command is joined into one shell line (every argument is a constant
 * of this script, never user input); elsewhere the binary is spawned directly.
 *
 * @param {string[]} commandArguments
 * @param {string} [platform]
 * @returns {{ command: string, commandArguments: string[], useShell: boolean }}
 */
export function buildPortlessInvocation(
  commandArguments,
  platform = process.platform
) {
  if (platform === WINDOWS_PLATFORM) {
    return {
      command: [PORTLESS_BINARY, ...commandArguments].join(" "),
      commandArguments: [],
      useShell: true,
    };
  }

  return {
    command: PORTLESS_BINARY,
    commandArguments,
    useShell: false,
  };
}

function logStep(description) {
  console.log(SCRIPT_MESSAGE.step(description));
}

function buildPortlessSpawnEnvironment() {
  return { ...process.env, ...PORTLESS_ENVIRONMENT };
}

function runPortlessSync(commandArguments, stdio = "inherit") {
  const invocation = buildPortlessInvocation(commandArguments);

  return spawnSync(invocation.command, invocation.commandArguments, {
    env: buildPortlessSpawnEnvironment(),
    shell: invocation.useShell,
    stdio,
  });
}

function isPortlessAvailable() {
  return runPortlessSync(["--help"], "ignore").status === EXIT_CODE.success;
}

/**
 * Reads the installed portless version.
 *
 * @returns {string} Trimmed `portless --version` output, empty when it cannot be read.
 */
function readPortlessVersion() {
  const versionResult = runPortlessSync(["--version"], "pipe");

  return versionResult.status === EXIT_CODE.success
    ? String(versionResult.stdout ?? "").trim()
    : "";
}

/**
 * Resolves every address of the dev host; a name that does not resolve yields
 * an empty list instead of an error, so the caller can explain how to fix it.
 *
 * @param {string} hostName
 * @returns {Promise<string[]>}
 */
async function resolveDevHostAddresses(hostName) {
  try {
    const results = await lookup(hostName, { all: true });

    return results.map((result) => result.address);
  } catch {
    return [];
  }
}

/**
 * Resolves the dev host's IPv4 addresses through Cloudflare's public DNS,
 * bypassing the network's resolver; failures yield an empty list.
 *
 * @param {string} hostName
 * @returns {Promise<string[]>}
 */
async function resolveDevHostAddressesPublicly(hostName) {
  const publicResolver = new Resolver({
    timeout: PUBLIC_DNS_QUERY.timeoutMs,
    tries: PUBLIC_DNS_QUERY.tries,
  });

  publicResolver.setServers(PUBLIC_DNS_SERVERS.ipv4);

  try {
    return await publicResolver.resolve4(hostName);
  } catch {
    return [];
  }
}

/**
 * Builds the elevated PowerShell script that sets Cloudflare's DNS on every
 * connected physical adapter (Wi-Fi or Ethernet, whichever is up) and clears
 * the DNS cache so the new servers answer right away.
 *
 * @returns {string}
 */
function buildPublicDnsSwitchScript() {
  const serverAddresses = [...PUBLIC_DNS_SERVERS.ipv4, ...PUBLIC_DNS_SERVERS.ipv6]
    .map((serverAddress) => `'${serverAddress}'`)
    .join(",");

  return [
    "$ErrorActionPreference = 'Stop'",
    "Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | ForEach-Object {",
    `  Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses (${serverAddresses})`,
    "}",
    "Clear-DnsClientCache",
  ].join("\n");
}

/**
 * Runs the DNS switch in an elevated PowerShell through UAC and waits for it.
 * The script travels as `-EncodedCommand`, so no quoting crosses the
 * elevation boundary.
 *
 * @returns {boolean} `false` when UAC is declined or the elevated script fails.
 */
function switchAdaptersToPublicDns() {
  const encodedScript = Buffer.from(
    buildPublicDnsSwitchScript(),
    POWERSHELL_ENCODED_COMMAND_ENCODING
  ).toString("base64");
  const elevation = spawnSync(
    POWERSHELL_BINARY,
    [
      "-NoProfile",
      "-Command",
      `$elevated = Start-Process ${POWERSHELL_BINARY} -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','${encodedScript}'; exit $elevated.ExitCode`,
    ],
    { stdio: "inherit" }
  );

  return elevation.status === EXIT_CODE.success;
}

/**
 * Fixes a local resolver that hides the public record by switching the
 * adapters to public DNS, only when `shouldSwitchToPublicDns` allows it.
 *
 * @param {string} hostName
 * @param {"loopback" | "elsewhere" | "missing"} localResolution
 * @param {boolean} isDryRun
 * @returns {Promise<string[] | null>} Addresses after the switch, or `null` when no switch ran.
 */
async function trySwitchingToPublicDns(hostName, localResolution, isDryRun) {
  const publicResolution = classifyDevHostResolution(
    await resolveDevHostAddressesPublicly(hostName)
  );

  if (
    !shouldSwitchToPublicDns({
      localResolution,
      platform: process.platform,
      publicResolution,
    })
  ) {
    return null;
  }

  if (isDryRun) {
    console.log(SCRIPT_MESSAGE.dnsSwitchPlanned);

    return null;
  }

  console.log(SCRIPT_MESSAGE.dnsSwitchRequest(hostName));

  if (!switchAdaptersToPublicDns()) {
    console.error(SCRIPT_MESSAGE.dnsSwitchFailed);

    return null;
  }

  return resolveDevHostAddresses(hostName);
}

async function ensureDevHostResolvesToLoopback(hostName, isDryRun) {
  let addresses = await resolveDevHostAddresses(hostName);
  let resolution = classifyDevHostResolution(addresses);

  if (resolution !== DEV_HOST_RESOLUTION.loopback) {
    const addressesAfterSwitch = await trySwitchingToPublicDns(
      hostName,
      resolution,
      isDryRun
    );

    if (addressesAfterSwitch) {
      addresses = addressesAfterSwitch;
      resolution = classifyDevHostResolution(addresses);
    }
  }

  if (resolution === DEV_HOST_RESOLUTION.loopback) {
    console.log(SCRIPT_MESSAGE.devHostLoopback(hostName));

    return true;
  }

  console.error(
    resolution === DEV_HOST_RESOLUTION.missing
      ? SCRIPT_MESSAGE.devHostMissing(hostName)
      : SCRIPT_MESSAGE.devHostElsewhere(hostName, addresses)
  );

  return false;
}

function ensurePortlessCaTrusted(isDryRun) {
  if (isPortlessCaTrusted(resolvePortlessStateDirectory(os.homedir()))) {
    console.log(SCRIPT_MESSAGE.caAlreadyTrusted);

    return;
  }

  console.log(SCRIPT_MESSAGE.caTrust);

  if (!isDryRun) {
    runPortlessSync(["trust"]);
  }
}

function runDevServer(commandArguments) {
  const invocation = buildPortlessInvocation(commandArguments);
  const devServer = spawn(invocation.command, invocation.commandArguments, {
    env: buildPortlessSpawnEnvironment(),
    shell: invocation.useShell,
    stdio: "inherit",
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      devServer.kill(signal);
    });
  }

  devServer.on("exit", (exitCode) => {
    process.exit(exitCode ?? EXIT_CODE.success);
  });
}

async function main() {
  const { isDryRun } = normalizeScriptArguments(process.argv.slice(2));
  const hostName = buildDevHostName();
  const commands = buildPortlessCommands();

  if (isDryRun) {
    console.log(SCRIPT_MESSAGE.dryRunHeader);
  }

  if (!isPortlessAvailable()) {
    console.error(SCRIPT_MESSAGE.portlessMissing);
    process.exit(EXIT_CODE.failure);
  }

  // Checked before `proxy stop`: an older portless would stop the running proxy and then fail to restart it on the dotted TLD.
  const portlessVersion = readPortlessVersion();

  if (!isPortlessVersionSupported(portlessVersion)) {
    console.error(SCRIPT_MESSAGE.portlessVersionUnsupported(portlessVersion));
    process.exit(EXIT_CODE.failure);
  }

  // Checked first: without the DNS record the browser cannot reach the proxy, so nothing else is worth starting.
  if (!(await ensureDevHostResolvesToLoopback(hostName, isDryRun)) && !isDryRun) {
    process.exit(EXIT_CODE.failure);
  }

  logStep(commands.proxyStop.description);
  if (!isDryRun) {
    runPortlessSync(commands.proxyStop.commandArguments);
  }

  logStep(commands.proxyStart.description);
  if (!isDryRun) {
    const proxyStart = runPortlessSync(commands.proxyStart.commandArguments);

    if (proxyStart.status !== EXIT_CODE.success) {
      console.error(SCRIPT_MESSAGE.proxyStartFailed);
      process.exit(EXIT_CODE.failure);
    }
  }

  ensurePortlessCaTrusted(isDryRun);

  await warnAboutPendingMigrations();

  logStep(commands.runDevServer.description);
  console.log(SCRIPT_MESSAGE.ready(hostName));

  if (!isDryRun) {
    runDevServer(commands.runDevServer.commandArguments);
  }
}

if ((process.argv[1] ?? "").endsWith("dev-portless.mjs")) {
  await main();
}
