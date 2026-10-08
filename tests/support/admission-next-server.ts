/** Owns one synthetic loopback Next process and private in-memory auth/keyring configuration. @module admission-next-server */
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import {pathToFileURL} from "node:url";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/** Configures only test-owned transport preloads and private synthetic environment inside the child. */
export type AdmissionNextServerOptions={preloadModules?:readonly string[];environment?:Readonly<Record<string,string>>;onProviderRequest?:()=>void;onDiagnosticCode?:(code:string)=>void;onDispatchObservation?:(observation:{stage:string;code:string})=>void};
/** @param environment - Exact owned branch connection environment, never logged or persisted. @param slug - Synthetic fixture slug used for the real readiness boundary. @param run - Native workflow receiving loopback origin and a generated auth signing secret. @param options - Optional owned test HTTP transport; SDK/platform libraries remain real. @returns The workflow result after its owned server has exited. */
export async function withAdmissionNextServer<Result>(environment: Readonly<{ DATABASE_URL: string; DATABASE_MAINTENANCE_URL: string }>, slug: string, run: (origin: string, secret: string) => Promise<Result>,options:AdmissionNextServerOptions={}): Promise<Result> {
  const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Admission Next fixture could not reserve its loopback port");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${address.port}`, secret = `${randomUUID()}${randomUUID()}`;
  const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
  const preloads=(options.preloadModules??[]).flatMap((path)=>["--import",pathToFileURL(path).href]);
  const server = spawn(process.execPath, [...preloads,join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--port", String(address.port)], { windowsHide: true, stdio:preloads.length?["ignore","ignore","ignore","ipc"]:"ignore", env: { ...process.env,...options.environment, ...environment, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin, GOOGLE_CLIENT_ID: randomUUID(), GOOGLE_CLIENT_SECRET: randomUUID(), SITEPING_ENABLED: "false", MESSAGING_SECURITY_ENVIRONMENT: "synthetic-review-ui", MESSAGING_SECURITY_EPOCH: randomUUID(), MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: JSON.stringify(keyrings) } });
  server.on("message",(message:unknown)=>{if(message==="admission_test_provider_request")options.onProviderRequest?.();else if(typeof message==="object"&&message!==null&&"kind"in message&&message.kind==="admission_test_diagnostic_code"&&"code"in message&&typeof message.code==="string"&&/^\d{6}$/u.test(message.code))options.onDiagnosticCode?.(message.code);else if(typeof message==="object"&&message!==null&&"kind"in message&&message.kind==="admission_test_dispatch_observation"&&"stage"in message&&typeof message.stage==="string"&&"code"in message&&typeof message.code==="string")options.onDispatchObservation?.({stage:message.stage,code:message.code});});
  const exited = once(server, "exit");
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (server.exitCode !== null) throw new Error("Admission Next fixture exited before readiness");
      try { ready = (await fetch(`${origin}/api/tribes/${slug}/admissions/overview?role=leader`, { signal: AbortSignal.timeout(2_000) })).status === 400; } catch { ready = false; }
      if (ready) break;
      await delay(250);
    }
    if (!ready) throw new Error("Admission Next fixture did not become ready");
    return await run(origin, secret);
  } finally { if (server.exitCode === null) server.kill(); await exited; }
}
