/** Observes actual Node cipher work without replacing any platform or application method. */
import { AsyncLocalStorage, createHook } from "node:async_hooks";
import { MESSAGING_NATIVE_CIPHER_PROVIDER } from "./constants/messaging-native-cipher-observation";

/**
 * @param operation - Awaited native work, including its retained deferred effects.
 * @returns The untouched result and scoped encrypt/decrypt job count; callers must calibrate the actual host first.
 * @throws The original operation error unchanged; a failed observation never becomes a passing result.
 */
export async function observeMessagingNativeCipher<Result>(operation: () => Promise<Result>): Promise<{ value: Result; cipherOperations: number }> {
  const scope = new AsyncLocalStorage<boolean>();
  let cipherOperations = 0;
  const hook = createHook({ init(_asyncId, type) { if (scope.getStore() === true && type === MESSAGING_NATIVE_CIPHER_PROVIDER) cipherOperations += 1; } });
  hook.enable();
  try { return { value: await scope.run(true, operation), cipherOperations }; }
  finally { hook.disable(); scope.disable(); }
}
