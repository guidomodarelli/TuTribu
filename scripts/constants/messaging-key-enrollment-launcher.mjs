/** Owns how the operator command loads the private TypeScript enrollment module outside Next. @module messaging-key-enrollment-launcher-constants */
export const MESSAGING_KEY_ENROLLMENT_LAUNCHER = {
  entryModule: "src/modules/messaging/infrastructure/operations/enroll-messaging-key-materials.ts",
  /** Mirrors the `@/*` path of tsconfig.json. */
  projectAlias: "@",
  /** Next's build-time marker has no runtime behavior in a private Node command. */
  serverOnlyModule: "server-only",
  serverOnlyReplacement: "next/dist/compiled/server-only/empty.js",
  operation: "messaging_key_enrollment",
  completedState: "completed",
  unexpectedFailure: "messaging_key_enrollment_failed",
};
