/**
 * Decides whether the local development server registers the email and
 * password sign-in that replaces Google OAuth.
 *
 * @module dev-sign-in-activation
 */

import {
  DEV_SIGN_IN_ACTIVATION,
  DEV_SIGN_IN_DEFAULT_MEMBER_NAME,
  DEV_SIGN_IN_ENABLED_FLAG_VALUES,
  DEV_SIGN_IN_ENVIRONMENT_VARIABLE,
  DEV_SIGN_IN_MAX_PASSWORD_LENGTH,
  DEV_SIGN_IN_MIN_PASSWORD_LENGTH,
  DEV_SIGN_IN_NODE_ENVIRONMENT,
} from "@/src/modules/auth/constants/dev-sign-in";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const IGNORED_DEV_SIGN_IN_FLAG_LOG = {
  feature: "dev-sign-in",
  message:
    "DEV_SIGN_IN is set outside next dev and was ignored; email and password sign-in stays unregistered",
  operation: "resolve-dev-sign-in-activation",
  requestId: "server-startup",
} as const;

const DEV_SIGN_IN_CONFIGURATION_ERROR_MESSAGE = {
  missingCredentials:
    "Dev sign-in is enabled (DEV_SIGN_IN) but DEV_SIGN_IN_EMAIL or DEV_SIGN_IN_PASSWORD is empty. Set both in .env.local or turn DEV_SIGN_IN off.",
  passwordLength: `Dev sign-in is enabled (DEV_SIGN_IN) but DEV_SIGN_IN_PASSWORD must have between ${DEV_SIGN_IN_MIN_PASSWORD_LENGTH} and ${DEV_SIGN_IN_MAX_PASSWORD_LENGTH} characters, the range Better Auth accepts.`,
} as const;

/** Outcome of the activation rule; `ignored-outside-development` means the flag was set where it is not allowed. */
export type DevSignInActivation =
  | "disabled"
  | "enabled"
  | "ignored-outside-development";

/** Environment values read by the development sign-in. */
export type DevSignInEnvironment = Partial<Record<string, string | undefined>>;

/** Credentials of the single member allowed to use the development sign-in. */
export type DevSignInCredentials = {
  email: string;
  name: string;
  password: string;
};

/**
 * Resolves whether the development sign-in must be registered.
 *
 * It only applies on `next dev` (`NODE_ENV=development`) with the flag set; a
 * flag set in any other environment is reported so it can be logged and ignored.
 *
 * @param environment - Process environment values.
 * @returns The activation outcome.
 */
export function resolveDevSignInActivation(
  environment: DevSignInEnvironment
): DevSignInActivation {
  const flagValue = environment[DEV_SIGN_IN_ENVIRONMENT_VARIABLE.flag]
    ?.trim()
    .toLowerCase();
  const isFlagOn = DEV_SIGN_IN_ENABLED_FLAG_VALUES.some(
    (enabledValue) => enabledValue === flagValue
  );

  if (!isFlagOn) {
    return DEV_SIGN_IN_ACTIVATION.disabled;
  }

  return environment.NODE_ENV === DEV_SIGN_IN_NODE_ENVIRONMENT
    ? DEV_SIGN_IN_ACTIVATION.enabled
    : DEV_SIGN_IN_ACTIVATION.ignoredOutsideDevelopment;
}

/**
 * Warns that the development sign-in flag was set on a server where it never
 * applies, so a misconfigured deployment is visible in the logs.
 *
 * @returns Nothing.
 */
export function reportIgnoredDevSignInFlag(): void {
  createServerLogger(IGNORED_DEV_SIGN_IN_FLAG_LOG).warn({
    message: IGNORED_DEV_SIGN_IN_FLAG_LOG.message,
  });
}

/**
 * Reads the development member credentials from the environment.
 *
 * @param environment - Process environment values.
 * @returns The normalized credentials.
 * @throws Error when the email or password is missing or the password length
 * is outside the range Better Auth accepts.
 */
export function resolveDevSignInCredentials(
  environment: DevSignInEnvironment
): DevSignInCredentials {
  const email = environment[DEV_SIGN_IN_ENVIRONMENT_VARIABLE.email]
    ?.trim()
    .toLowerCase();
  const password = environment[DEV_SIGN_IN_ENVIRONMENT_VARIABLE.password];
  const name =
    environment[DEV_SIGN_IN_ENVIRONMENT_VARIABLE.name]?.trim() ||
    DEV_SIGN_IN_DEFAULT_MEMBER_NAME;

  if (!email || !password) {
    throw new Error(DEV_SIGN_IN_CONFIGURATION_ERROR_MESSAGE.missingCredentials);
  }

  if (
    password.length < DEV_SIGN_IN_MIN_PASSWORD_LENGTH ||
    password.length > DEV_SIGN_IN_MAX_PASSWORD_LENGTH
  ) {
    throw new Error(DEV_SIGN_IN_CONFIGURATION_ERROR_MESSAGE.passwordLength);
  }

  return { email, name, password };
}

/**
 * Resolves the email the sign-in page pre-fills in the development form.
 *
 * @param environment - Process environment values.
 * @returns The development member email, or `null` when the development
 * sign-in is not active on this server.
 */
export function resolveDevSignInFormEmail(
  environment: DevSignInEnvironment
): string | null {
  if (resolveDevSignInActivation(environment) !== DEV_SIGN_IN_ACTIVATION.enabled) {
    return null;
  }

  return resolveDevSignInCredentials(environment).email;
}
