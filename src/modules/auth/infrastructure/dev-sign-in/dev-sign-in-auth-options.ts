/**
 * Better Auth wiring of the development-only email and password sign-in.
 *
 * On `next dev` with `DEV_SIGN_IN=1` it enables Better Auth's email and
 * password endpoint for a single member described by `DEV_SIGN_IN_*`, and
 * provisions that member right before each sign-in. Anywhere else the options
 * are returned untouched, so the endpoint is never registered.
 *
 * @module dev-sign-in-auth-options
 */

import type {
  AuthContext,
  BetterAuthOptions,
  BetterAuthPlugin,
} from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

import {
  DEV_SIGN_IN_ACTIVATION,
  DEV_SIGN_IN_CREDENTIAL_PROVIDER_ID,
  DEV_SIGN_IN_ENDPOINT_PATH,
  DEV_SIGN_IN_PLUGIN_ID,
} from "@/src/modules/auth/constants/dev-sign-in";
import {
  reportIgnoredDevSignInFlag,
  resolveDevSignInActivation,
  resolveDevSignInCredentials,
  type DevSignInCredentials,
  type DevSignInEnvironment,
} from "@/src/modules/auth/infrastructure/dev-sign-in/dev-sign-in-activation";

const DEV_SIGN_IN_REJECTION = {
  message: "Only the configured development member can use email sign-in.",
  status: "FORBIDDEN",
} as const;

type DevSignInRequestBody = {
  email?: unknown;
};

/**
 * Creates or updates the development member so its stored credential always
 * matches `DEV_SIGN_IN_PASSWORD`. Idempotent: an unchanged password is only
 * verified, not rewritten.
 *
 * @param context - Better Auth context of the current request.
 * @param credentials - Development member credentials.
 * @returns Nothing.
 */
async function ensureDevSignInMember(
  context: AuthContext,
  credentials: DevSignInCredentials
): Promise<void> {
  const existingMember = await context.internalAdapter.findUserByEmail(
    credentials.email,
    { includeAccounts: true }
  );
  const memberId =
    existingMember?.user.id ??
    (
      await context.internalAdapter.createUser({
        email: credentials.email,
        emailVerified: true,
        name: credentials.name,
      })
    ).id;
  const credentialAccount = existingMember?.accounts.find(
    (account) => account.providerId === DEV_SIGN_IN_CREDENTIAL_PROVIDER_ID
  );

  if (
    credentialAccount?.password &&
    (await context.password.verify({
      hash: credentialAccount.password,
      password: credentials.password,
    }))
  ) {
    return;
  }

  const passwordHash = await context.password.hash(credentials.password);

  if (credentialAccount) {
    await context.internalAdapter.updatePassword(memberId, passwordHash);
    return;
  }

  await context.internalAdapter.linkAccount({
    accountId: memberId,
    password: passwordHash,
    providerId: DEV_SIGN_IN_CREDENTIAL_PROVIDER_ID,
    userId: memberId,
  });
}

/**
 * Better Auth plugin that limits email sign-in to the development member and
 * provisions it before Better Auth checks the password.
 *
 * @param credentials - Development member credentials.
 * @returns The plugin.
 */
function createDevSignInPlugin(
  credentials: DevSignInCredentials
): BetterAuthPlugin {
  return {
    hooks: {
      before: [
        {
          handler: createAuthMiddleware(async (context) => {
            const { email } = (context.body ?? {}) as DevSignInRequestBody;

            if (
              typeof email !== "string" ||
              email.trim().toLowerCase() !== credentials.email
            ) {
              throw new APIError(DEV_SIGN_IN_REJECTION.status, {
                message: DEV_SIGN_IN_REJECTION.message,
              });
            }

            await ensureDevSignInMember(context.context, credentials);
          }),
          matcher: (context) => context.path === DEV_SIGN_IN_ENDPOINT_PATH,
        },
      ],
    },
    id: DEV_SIGN_IN_PLUGIN_ID,
  };
}

/**
 * Adds the development sign-in to the Better Auth options when it is active.
 *
 * Requires both `NODE_ENV=development` and `DEV_SIGN_IN`. With the flag set on
 * any other server the options stay untouched and a warning is logged. Public
 * sign-up stays disabled, so only the configured member can sign in.
 *
 * @param options - Better Auth options of the application.
 * @param environment - Process environment values.
 * @returns The options, with email and password sign-in only on `next dev`.
 * @throws Error when the flag is active but the credentials are incomplete.
 */
export function withDevSignIn(
  options: BetterAuthOptions,
  environment: DevSignInEnvironment
): BetterAuthOptions {
  const activation = resolveDevSignInActivation(environment);

  if (activation === DEV_SIGN_IN_ACTIVATION.ignoredOutsideDevelopment) {
    reportIgnoredDevSignInFlag();
  }

  if (activation !== DEV_SIGN_IN_ACTIVATION.enabled) {
    return options;
  }

  const credentials = resolveDevSignInCredentials(environment);

  return {
    ...options,
    emailAndPassword: { disableSignUp: true, enabled: true },
    // Keeps the application plugins last: `nextCookies` must stay the final one.
    plugins: [createDevSignInPlugin(credentials), ...(options.plugins ?? [])],
  };
}
