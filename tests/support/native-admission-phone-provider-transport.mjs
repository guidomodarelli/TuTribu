/** Closes external HTTP around the actual SDK while allowing one explicit WhatsApp-to-SMS fixture. @module native-admission-phone-provider-transport */
import { randomUUID } from "node:crypto";

/** Preserves the actual framework fetch without replacing SDK or platform modules. */
const nativeFetch = globalThis.fetch;
/** Private synthetic setup belongs only to the owned child process. */
const credential = process.env.ADMISSION_TEST_ZAVU_CREDENTIAL;
const recipient = process.env.ADMISSION_TEST_ZAVU_RECIPIENT;
const frameworkOrigin = new URL(process.env.BETTER_AUTH_URL).origin;
if (!credential || !recipient) throw new Error("NativeAdmissionPhoneTransport failed: synthetic_scope_missing");

/**
 * Restricts real SDK messages to the fixture's original phone and exact channel resources.
 * @param input - Native fetch input from Next or the pinned SDK.
 * @param init - Request options, including the original cancellation signal.
 * @returns A synthetic HTTP acceptance or the untouched loopback framework response.
 * @throws A safe fixed error when traffic or message authority crosses the fixture scope.
 */
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init), url = new URL(request.url);
  if (url.origin === frameworkOrigin) return nativeFetch(input, init);
  if (url.origin !== "https://api.zavu.dev" || url.pathname !== "/v1/messages" || url.search || request.method !== "POST") throw new Error("NativeAdmissionPhoneTransport failed: unregistered_external_request");
  request.signal.throwIfAborted();
  if (request.headers.get("Authorization") !== `Bearer ${credential}`) throw new Error("NativeAdmissionPhoneTransport failed: crossed_credential");
  const body = await request.json(), whatsapp = body.channel === "whatsapp", sms = body.channel === "sms";
  const sender = whatsapp ? process.env.ADMISSION_TEST_ZAVU_WHATSAPP_SENDER : process.env.ADMISSION_TEST_ZAVU_SMS_SENDER;
  const code = whatsapp ? body.content?.templateVariables?.["1"] : typeof body.text === "string" ? body.text.match(/\b\d{6}\b/u)?.[0] : undefined;
  const contentMatches = whatsapp ? body.messageType === "template" && body.content?.templateId === process.env.ADMISSION_TEST_ZAVU_TEMPLATE_ID && body.text === undefined && body.templateLanguage === undefined : body.messageType === "text" && body.content === undefined;
  if ((!whatsapp && !sms) || !sender || body.to !== recipient || body.fallbackEnabled !== false || request.headers.get("Zavu-Sender") !== sender || !contentMatches || typeof body.idempotencyKey !== "string" || typeof code !== "string" || !/^\d{6}$/u.test(code)) throw new Error("NativeAdmissionPhoneTransport failed: crossed_message_intent");
  // IPC reports counts and simulates receipt in memory; body, credential and code never enter logs.
  process.send?.("admission_test_provider_request");
  process.send?.({ kind: "admission_test_diagnostic_code", code });
  return Response.json({ message: { id: randomUUID(), direction: "outbound", channel: body.channel, status: "sent" } });
};
