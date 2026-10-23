/** Composes what each feature needs from the server environment, checked once at startup. @module server-environment-requirements */
import { BETTER_AUTH_ENV } from "@/src/modules/auth/constants/better-auth-config";
import { MESSAGING_HOSTING_ENV } from "@/src/modules/messaging/constants/messaging-hosting";
import { SERVER_ENVIRONMENT_SEVERITY } from "@/src/modules/shared/constants/server-environment-check";
import type { ServerEnvironmentRequirement } from "@/src/modules/shared/infrastructure/config/server-environment-check";
import { CLOUDFLARE_IMAGES_ENV } from "@/src/modules/shared/infrastructure/cloudflare/cloudflare-images-config";
import { DATABASE_URL_ENV } from "@/src/modules/shared/infrastructure/database/server-environment";
import { CLOUDFLARE_R2_ENV } from "@/src/modules/shared/infrastructure/storage/cloudflare-r2-config";

/**
 * Blocking requirements stop local development at startup; degraded ones only warn because the feature turns itself off.
 * Add a requirement in the same change that makes a feature read a new variable.
 */
export const SERVER_ENVIRONMENT_REQUIREMENTS: readonly ServerEnvironmentRequirement[] = [
  { feature: "database", severity: SERVER_ENVIRONMENT_SEVERITY.blocking, variables: [DATABASE_URL_ENV] },
  // Better Auth refuses to initialize without the Google provider, so its credentials block like the secret and URL.
  { feature: "auth", severity: SERVER_ENVIRONMENT_SEVERITY.blocking, variables: [BETTER_AUTH_ENV.secret, BETTER_AUTH_ENV.url, BETTER_AUTH_ENV.googleClientId, BETTER_AUTH_ENV.googleClientSecret] },
  {
    feature: "messaging-security",
    severity: SERVER_ENVIRONMENT_SEVERITY.blocking,
    variables: Object.values(MESSAGING_HOSTING_ENV),
    // Parses and imports the keyrings exactly as the admission ledger does, so a malformed value fails here and not in a decision.
    validate: async (environment) => {
      const { readMessagingHostingSecurityConfig } = await import("@/src/modules/messaging/infrastructure/config/messaging-hosting-security");
      return readMessagingHostingSecurityConfig(environment);
    },
  },
  { feature: "attachments-r2", severity: SERVER_ENVIRONMENT_SEVERITY.degraded, variables: Object.values(CLOUDFLARE_R2_ENV) },
  { feature: "images-cloudflare", severity: SERVER_ENVIRONMENT_SEVERITY.degraded, variables: [CLOUDFLARE_IMAGES_ENV.accountId, CLOUDFLARE_IMAGES_ENV.apiToken, CLOUDFLARE_IMAGES_ENV.accountHash] },
];
