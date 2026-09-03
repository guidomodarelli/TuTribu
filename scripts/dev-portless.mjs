#!/usr/bin/env node
/**
 * Starts the local dev server the way `AGENTS.md` mandates: restarts the
 * portless proxy with HTTPS on the `app` TLD, makes sure `dev-tutribu.app`
 * resolves to loopback and that the portless CA is trusted, then runs
 * `next dev` through portless so the app is served at
 * `https://dev-tutribu.app`.
 *
 * Usage:
 *   npm run dev [-- --dry-run]
 *   node scripts/dev-portless.mjs [--dry-run]
 *
 * `--dry-run` prints every step and the current machine state without
 * touching the proxy, the hosts file or the trust store.
 *
 * The hosts file is the only step that needs elevated privileges. On Windows
 * it triggers a UAC prompt for a single `Add-Content` command; on macOS and
 * Linux it asks for the `sudo` password once. Every other step runs as the
 * current user and is idempotent, so the script can be rerun freely.
 *
 * @module dev-portless
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Portless route and TLD the local environment is configured for. */
const PORTLESS_DEV = {
  appName: "dev-tutribu",
  tld: "app",
};

/** Loopback address the dev host must resolve to. */
const LOOPBACK_ADDRESS = "127.0.0.1";

/** Trailing comment that identifies the hosts entry this script writes. */
const HOSTS_ENTRY_MARKER = "# portless " + PORTLESS_DEV.appName;

/** Files portless keeps under its state directory. */
const PORTLESS_STATE = {
  directoryName: ".portless",
  trustedMarkerFile: "ca.trusted",
};

const PORTLESS_BINARY = "portless";
const DEV_SERVER_COMMAND = ["next", "dev"];
const DRY_RUN_FLAG = "--dry-run";
const WINDOWS_PLATFORM = "win32";
const DEFAULT_WINDOWS_SYSTEM_ROOT = "C:\\Windows";
const UNIX_HOSTS_PATH = "/etc/hosts";
const POWERSHELL_BINARY = "powershell";
const SUDO_BINARY = "sudo";
const EXIT_CODE = {
  failure: 1,
  success: 0,
};
const HOSTS_LINE_COMMENT_PREFIX = "#";
const HOSTS_LINE_SEPARATOR = /\r?\n/;
const HOSTS_FIELD_SEPARATOR = /\s+/;
const IS_WINDOWS = process.platform === WINDOWS_PLATFORM;

const SCRIPT_MESSAGE = {
  caAlreadyTrusted: "CA de portless ya confiable, no hace falta portless trust.",
  caTrust: "Registrando la CA de portless en el almacén de certificados...",
  dryRunHeader: "Modo --dry-run: no se ejecuta nada, solo se muestra el plan.",
  hostsEntryMissing: (hostName, hostsPath) =>
    `Falta la entrada de ${hostName} en ${hostsPath}. Se pedirán permisos de administrador para agregarla.`,
  hostsEntryPresent: (hostName) =>
    `${hostName} ya resuelve a loopback en el archivo hosts.`,
  hostsEntryStillMissing: (hostName, hostsPath, entry) =>
    `No se pudo agregar ${hostName} al archivo hosts. Agregá esta línea a mano en ${hostsPath}:\n  ${entry}`,
  portlessMissing:
    "portless no está instalado. Instalalo con: npm install -g portless",
  proxyStartFailed: "No se pudo iniciar el proxy de portless.",
  ready: (hostName) => `Listo: la app se sirve en https://${hostName}`,
  step: (description) => `→ ${description}`,
};

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
      commandArguments: ["proxy", "start", "--https", "--tld", options.tld],
      description: `Iniciar el proxy de portless con HTTPS y TLD .${options.tld}`,
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
 * Tells whether the hosts file already maps the host name to loopback.
 * Comment lines are ignored and any position inside a loopback line counts.
 *
 * @param {string} hostsContent
 * @param {string} hostName
 * @returns {boolean}
 */
export function hasHostsEntry(hostsContent, hostName) {
  return hostsContent.split(HOSTS_LINE_SEPARATOR).some((line) => {
    const trimmedLine = line.trim();

    if (
      trimmedLine.length === 0 ||
      trimmedLine.startsWith(HOSTS_LINE_COMMENT_PREFIX)
    ) {
      return false;
    }

    const [address, ...hostNames] = trimmedLine
      .split(HOSTS_LINE_COMMENT_PREFIX)[0]
      .trim()
      .split(HOSTS_FIELD_SEPARATOR);

    return address === LOOPBACK_ADDRESS && hostNames.includes(hostName);
  });
}

/**
 * Builds the loopback line appended to the hosts file for the dev host.
 *
 * @param {string} hostName
 * @returns {string}
 */
export function buildHostsEntry(hostName) {
  return `${LOOPBACK_ADDRESS} ${hostName} ${HOSTS_ENTRY_MARKER}`;
}

/**
 * Resolves the system hosts file for the given platform.
 *
 * @param {string} platform
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {string}
 */
export function resolveHostsPath(platform, environment = process.env) {
  if (platform === WINDOWS_PLATFORM) {
    return path.win32.join(
      environment.SystemRoot ?? DEFAULT_WINDOWS_SYSTEM_ROOT,
      "System32",
      "drivers",
      "etc",
      "hosts"
    );
  }

  return UNIX_HOSTS_PATH;
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

function runPortlessSync(commandArguments, stdio = "inherit") {
  const invocation = buildPortlessInvocation(commandArguments);

  return spawnSync(invocation.command, invocation.commandArguments, {
    shell: invocation.useShell,
    stdio,
  });
}

function isPortlessAvailable() {
  return runPortlessSync(["--help"], "ignore").status === EXIT_CODE.success;
}

/**
 * Appends the hosts entry with elevated privileges: a UAC-prompted PowerShell
 * on Windows, `sudo` elsewhere. Returns once the elevated process exits.
 */
function appendHostsEntryElevated(hostsPath, entry) {
  if (IS_WINDOWS) {
    const temporaryDirectory = mkdtempSync(
      path.join(os.tmpdir(), "dev-portless-hosts-")
    );
    const elevatedScriptPath = path.join(temporaryDirectory, "add-hosts-entry.ps1");

    writeFileSync(
      elevatedScriptPath,
      `Add-Content -LiteralPath '${hostsPath}' -Value ([Environment]::NewLine + '${entry}')\n`
    );

    const elevatedArguments = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      elevatedScriptPath,
    ]
      .map((argument) => `'${argument}'`)
      .join(",");

    spawnSync(
      POWERSHELL_BINARY,
      [
        "-NoProfile",
        "-Command",
        `Start-Process -FilePath ${POWERSHELL_BINARY} -Verb RunAs -Wait -ArgumentList ${elevatedArguments}`,
      ],
      { stdio: "inherit" }
    );

    return;
  }

  spawnSync(
    SUDO_BINARY,
    ["sh", "-c", `printf '\\n%s\\n' '${entry}' >> '${hostsPath}'`],
    { stdio: "inherit" }
  );
}

function readHostsFile(hostsPath) {
  return existsSync(hostsPath) ? readFileSync(hostsPath, "utf8") : "";
}

function ensureHostsEntry(hostName, hostsPath, isDryRun) {
  if (hasHostsEntry(readHostsFile(hostsPath), hostName)) {
    console.log(SCRIPT_MESSAGE.hostsEntryPresent(hostName));

    return true;
  }

  console.log(SCRIPT_MESSAGE.hostsEntryMissing(hostName, hostsPath));

  if (isDryRun) {
    return true;
  }

  const entry = buildHostsEntry(hostName);

  appendHostsEntryElevated(hostsPath, entry);

  if (hasHostsEntry(readHostsFile(hostsPath), hostName)) {
    return true;
  }

  console.error(SCRIPT_MESSAGE.hostsEntryStillMissing(hostName, hostsPath, entry));

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

function main() {
  const { isDryRun } = normalizeScriptArguments(process.argv.slice(2));
  const hostName = buildDevHostName();
  const hostsPath = resolveHostsPath(process.platform);
  const commands = buildPortlessCommands();

  if (isDryRun) {
    console.log(SCRIPT_MESSAGE.dryRunHeader);
  }

  if (!isPortlessAvailable()) {
    console.error(SCRIPT_MESSAGE.portlessMissing);
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

  if (!ensureHostsEntry(hostName, hostsPath, isDryRun)) {
    process.exit(EXIT_CODE.failure);
  }

  ensurePortlessCaTrusted(isDryRun);

  logStep(commands.runDevServer.description);
  console.log(SCRIPT_MESSAGE.ready(hostName));

  if (!isDryRun) {
    runDevServer(commands.runDevServer.commandArguments);
  }
}

if ((process.argv[1] ?? "").endsWith("dev-portless.mjs")) {
  main();
}
