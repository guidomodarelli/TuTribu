/** Blocks only the external checkout HTTP boundary while exercising the real SDK/runtime. @module native-admission-checkout-provider-transport */
import { ACADEMY_CHECKOUT_PROVIDER_HOST, ACADEMY_CHECKOUT_PROVIDER_NOTICE } from "./constants/academy-checkout-boundary.mjs";
/** Keeps framework, auth, database and internal fetches on their original native implementation. */
const nativeFetch = globalThis.fetch;
/** @param input - Native fetch input. @returns Its absolute URL text without reading the request body. */
function readRequestHref(input) {
  if (input instanceof Request) return input.url;
  return input instanceof URL ? input.href : String(input);
}
/** @param input - Native fetch input from the actual adapter. @param init - Native request options, never logged or serialized. @returns Original internal fetch; provider requests are counted and rejected before external I/O. */
globalThis.fetch = async (input, init) => {
  const requestUrl = new URL(readRequestHref(input));
  if (requestUrl.hostname === ACADEMY_CHECKOUT_PROVIDER_HOST) {
    process.send?.(ACADEMY_CHECKOUT_PROVIDER_NOTICE);
    throw new Error("ProtectedAcademyCheckoutTest: unexpected external checkout request blocked");
  }
  return nativeFetch(input, init);
};
