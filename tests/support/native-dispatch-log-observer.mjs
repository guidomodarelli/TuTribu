/** Observes actual child-process dispatch JSON and records only safe fields plus a private-material leak boolean. @module native-dispatch-log-observer */
import { appendFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import pg from "pg";

/** Private test-owned output and runtime-generated canaries never leave this process as log material. */
const outputPath = process.env.ADMISSION_TEST_DISPATCH_LOG_OUTPUT;
const credential = process.env.ADMISSION_TEST_ZAVU_CREDENTIAL;
const canary = process.env.ADMISSION_TEST_DISPATCH_LOG_CANARY;
if (!outputPath || !isAbsolute(outputPath) || !credential || !canary) throw new Error("NativeDispatchLogObserver failed: owned_observation_scope_missing");
const privateValues = new Set([credential, canary]);
const originalFetch = globalThis.fetch;
let completionFailureInstalled = false;
/** @param input - Actual fetch request after the closed provider preload. @param init - Native request options. @returns The unchanged provider or framework response after retaining only the code canary in memory. */
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init), url = new URL(request.url);
  if (url.origin === "https://api.zavu.dev" && url.pathname === "/v1/messages" && request.method === "POST") {
    const payload = await request.clone().json();
    const code = payload.content?.templateVariables?.["1"] ?? payload.text?.match(/\b\d{6}\b/u)?.[0];
    if (typeof code === "string") privateValues.add(code);
    if (!completionFailureInstalled && typeof code === "string") {
      const client = new pg.Client({ connectionString: process.env.DATABASE_MAINTENANCE_URL, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
      try {
        await client.connect();
        await client.query("create function public.fail_owned_dispatch_completion() returns trigger language plpgsql as $$ begin raise exception 'Synthetic dispatch completion cause %, credential %, otp %',TG_ARGV[0],TG_ARGV[1],TG_ARGV[2] using errcode='P0001'; end $$");
        const escapeLiteral = (value) => "'" + value.replaceAll("'", "''") + "'";
        await client.query(`create trigger owned_dispatch_completion_failure before update on public.message_delivery_attempts for each row when (old.state='in_flight') execute function public.fail_owned_dispatch_completion(${[canary, credential, code].map(escapeLiteral).join(",")})`);
        completionFailureInstalled = true;
      } finally { await client.end(); }
    }
  }
  return originalFetch(input, init);
};
const originalError = console.error;
/** @param left - One field name. @param right - Another field name. @returns Their UTF-16 code unit order, the same order as the default `sort()`. */
const compareCodeUnits = (left, right) => {
  if (left < right) return -1;
  return left > right ? 1 : 0;
};
/** @param value - One final metadata field. @returns A private-canary-free scalar, never the original value when it is unsafe. */
const safeField = (value) => typeof value === "string" && ![...privateValues].some((privateValue) => value.includes(privateValue)) ? value : "[redacted]";
/** @param argumentsList - Actual final console output emitted by the root's unmodified createServerLogger. @returns Nothing after safe observation and forwarding the original output to the hidden child stderr. */
console.error = (...argumentsList) => {
  if (argumentsList.length === 1 && typeof argumentsList[0] === "string") {
    let entry;
    try { entry = JSON.parse(argumentsList[0]); } catch { entry = null; }
    if (entry?.feature === "academy-admissions" && entry.operation === "admission-contact-dispatch") {
      const privateMaterialDetected = [...privateValues].some((value) => argumentsList[0].includes(value));
      const safe = { feature: safeField(entry.feature), operation: safeField(entry.operation), requestId: safeField(entry.requestId), traceId: safeField(entry.traceId), message: safeField(entry.message), metadata: { stage: safeField(entry.metadata?.stage), code: safeField(entry.metadata?.code), deliveryId: safeField(entry.metadata?.deliveryId), attemptId: safeField(entry.metadata?.attemptId) }, hasError: Object.hasOwn(entry, "error"), privateMaterialDetected, topLevelFields: Object.keys(entry).map(safeField).sort(compareCodeUnits), metadataFields: Object.keys(entry.metadata ?? {}).map(safeField).sort(compareCodeUnits) };
      appendFileSync(outputPath, JSON.stringify(safe) + "\n", "utf8");
      if (privateMaterialDetected) return;
    }
  }
  // Non-string diagnostics may expose non-enumerable Error fields or custom inspection; this observer only forwards plain safe strings.
  if (argumentsList.some((value) => typeof value !== "string")) return;
  const rendered = argumentsList.join(" ");
  if ([...privateValues].some((value) => rendered.includes(value))) return;
  originalError(...argumentsList);
};
