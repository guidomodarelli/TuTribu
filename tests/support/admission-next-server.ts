/** Owns one synthetic loopback Next process and private in-memory auth/keyring configuration. @module admission-next-server */
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import {pathToFileURL} from "node:url";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_HOSTING_ENV } from "@/src/modules/messaging/constants/messaging-hosting";

/** Configures only test-owned transport preloads and private synthetic environment inside the child. */
export type AdmissionNextServerOptions={preloadModules?:readonly string[];environment?:Readonly<Record<string,string>>;publicBaseUrl?:string;messagingSecurity?:Readonly<{environment:string;securityEpoch:string;keyringsJson:string}>;onProviderRequest?:()=>void;onDiagnosticCode?:(code:string)=>void;onDispatchObservation?:(observation:{stage:string;code:string})=>void;onQueryCount?:(observation:AdmissionRequestQueryCount)=>void};
/** Aggregate native pg activity of one HTTP request, reported by the `admission-query-counter.mjs` preload without SQL text or values. */
export type AdmissionRequestQueryCount={method:string;path:string;status:number;durationMs:number;checkouts:number;transactions:number;commits:number;rollbacks:number;queries:number;statements:number;sequentialRoundTrips:number;pending:number};
/** Kind of the preload's IPC message and the numeric fields it must carry. */
const QUERY_COUNT_MESSAGE_KIND="admission_test_query_count";
const QUERY_COUNT_NUMERIC_FIELDS=["status","durationMs","checkouts","transactions","commits","rollbacks","queries","statements","sequentialRoundTrips","pending"] as const;
/** @param message - Untrusted child IPC payload. @returns The closed observation, or null when it is not one. */
function readQueryCount(message:unknown):AdmissionRequestQueryCount|null{
  if(typeof message!=="object"||message===null||Reflect.get(message,"kind")!==QUERY_COUNT_MESSAGE_KIND)return null;
  const method:unknown=Reflect.get(message,"method"),path:unknown=Reflect.get(message,"path");
  if(typeof method!=="string"||typeof path!=="string")return null;
  const numbers=Object.fromEntries(QUERY_COUNT_NUMERIC_FIELDS.map((field)=>[field,Reflect.get(message,field)]));
  if(!Object.values(numbers).every((value)=>typeof value==="number"&&Number.isFinite(value)))return null;
  return{method,path,...(numbers as Record<(typeof QUERY_COUNT_NUMERIC_FIELDS)[number],number>)};
}
/** @param environment - Exact owned branch connection environment, never logged or persisted. @param slug - Synthetic fixture slug used for the real readiness boundary. @param run - Native workflow receiving loopback origin and a generated auth signing secret. @param options - Optional owned test HTTP transport; SDK/platform libraries remain real. @returns The workflow result after its owned server has exited. */
export async function withAdmissionNextServer<Result>(environment: Readonly<{ DATABASE_URL: string; DATABASE_MAINTENANCE_URL: string }>, slug: string, run: (origin: string, secret: string) => Promise<Result>,options:AdmissionNextServerOptions={}): Promise<Result> {
  const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Admission Next fixture could not reserve its loopback port");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${address.port}`, secret = `${randomUUID()}${randomUUID()}`;
  const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
  // A suite that seeded its private MAC keys from the test process's synthetic hosting configuration must hand the server that same configuration.
  const inheritedKeyrings = process.env[MESSAGING_HOSTING_ENV.keyrings], inheritedEnvironment = process.env[MESSAGING_HOSTING_ENV.environment], inheritedEpoch = process.env[MESSAGING_HOSTING_ENV.securityEpoch];
  const messagingSecurity = options.messagingSecurity ?? (inheritedKeyrings && inheritedEnvironment && inheritedEpoch ? { environment: inheritedEnvironment, securityEpoch: inheritedEpoch, keyringsJson: inheritedKeyrings } : undefined);
  const preloads=(options.preloadModules??[]).flatMap((path)=>["--import",pathToFileURL(path).href]);
  const server = spawn(process.execPath, [...preloads,join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--port", String(address.port)], { windowsHide: true, stdio:preloads.length?["ignore","ignore","ignore","ipc"]:"ignore", env: { ...process.env,...options.environment, ...environment, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: options.publicBaseUrl??origin, GOOGLE_CLIENT_ID: randomUUID(), GOOGLE_CLIENT_SECRET: randomUUID(), SITEPING_ENABLED: "false", MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity?.environment??"synthetic-review-ui", MESSAGING_SECURITY_EPOCH: messagingSecurity?.securityEpoch??randomUUID(), MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity?.keyringsJson??JSON.stringify(keyrings) } });
  server.on("message",(message:unknown)=>{const queryCount=readQueryCount(message);if(queryCount)options.onQueryCount?.(queryCount);else if(message==="admission_test_provider_request")options.onProviderRequest?.();else if(typeof message==="object"&&message!==null&&"kind"in message&&message.kind==="admission_test_diagnostic_code"&&"code"in message&&typeof message.code==="string"&&/^\d{6}$/u.test(message.code))options.onDiagnosticCode?.(message.code);else if(typeof message==="object"&&message!==null&&"kind"in message&&message.kind==="admission_test_dispatch_observation"&&"stage"in message&&typeof message.stage==="string"&&"code"in message&&typeof message.code==="string")options.onDispatchObservation?.({stage:message.stage,code:message.code});});
  const exited = once(server, "exit");
  try {
    let ready = false, readinessFailures = 0;
    const readinessStatuses: number[] = [];
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (server.exitCode !== null) throw new Error("Admission Next fixture exited before readiness");
      try { const status = (await fetch(`${origin}/api/tribes/${slug}/admissions/overview?role=leader`, { signal: AbortSignal.timeout(2_000) })).status; if (!readinessStatuses.includes(status)) readinessStatuses.push(status); ready = status === 400; } catch { readinessFailures += 1; ready = false; }
      if (ready) break;
      await delay(250);
    }
    if (!ready) throw new Error(`Admission Next fixture did not become ready ${JSON.stringify({ statuses: readinessStatuses, failures: readinessFailures, exited: server.exitCode !== null })}`);
    return await run(origin, secret);
  } finally { if (server.exitCode === null) server.kill(); await exited; }
}
