/**
 * Next.js server instrumentation entrypoint.
 *
 * Next.js compiles and calls this file for both the Node.js and the edge
 * runtimes. Node.js-only startup work (the development provider mocks, which
 * need `msw/node`) lives in `instrumentation-node.ts`.
 *
 * @module instrumentation
 */

/**
 * Runs once when a Next.js server instance starts.
 *
 * The import must stay inside the literal `NEXT_RUNTIME` check: Next.js inlines
 * the runtime name per bundle, so the edge bundle drops the import entirely
 * instead of failing to resolve Node.js-only modules.
 *
 * @returns Promise resolved once startup work is done.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeInstrumentation } = await import("./instrumentation-node");
    await registerNodeInstrumentation();
  }
}
