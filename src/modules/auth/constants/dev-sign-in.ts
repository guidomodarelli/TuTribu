/**
 * Settings of the development-only email and password sign-in that replaces
 * Google OAuth on the local `next dev` server.
 *
 * @module dev-sign-in
 */

/** Environment variables read by the development sign-in. */
export const DEV_SIGN_IN_ENVIRONMENT_VARIABLE = {
  email: "DEV_SIGN_IN_EMAIL",
  flag: "DEV_SIGN_IN",
  name: "DEV_SIGN_IN_NAME",
  password: "DEV_SIGN_IN_PASSWORD",
} as const;

/** Flag values, compared after trimming and lowercasing, that turn the development sign-in on. */
export const DEV_SIGN_IN_ENABLED_FLAG_VALUES = ["1", "true"] as const;

/** `NODE_ENV` of the only server allowed to register the development sign-in. */
export const DEV_SIGN_IN_NODE_ENVIRONMENT = "development";

/** Possible results of evaluating the development sign-in activation rule. */
export const DEV_SIGN_IN_ACTIVATION = {
  disabled: "disabled",
  enabled: "enabled",
  ignoredOutsideDevelopment: "ignored-outside-development",
} as const;

/** Name given to the development member when `DEV_SIGN_IN_NAME` is empty. */
export const DEV_SIGN_IN_DEFAULT_MEMBER_NAME = "Integrante de desarrollo";

/**
 * Shortest password Better Auth accepts by default, checked at startup so a
 * short `DEV_SIGN_IN_PASSWORD` fails with an actionable message.
 */
export const DEV_SIGN_IN_MIN_PASSWORD_LENGTH = 8;

/**
 * Longest password Better Auth accepts by default (`maxPasswordLength`),
 * checked at startup so a longer `DEV_SIGN_IN_PASSWORD` does not render a form
 * whose every attempt is rejected.
 */
export const DEV_SIGN_IN_MAX_PASSWORD_LENGTH = 128;

/** Better Auth endpoint path of the email and password sign-in. */
export const DEV_SIGN_IN_ENDPOINT_PATH = "/sign-in/email";

/** Better Auth provider id of email and password accounts. */
export const DEV_SIGN_IN_CREDENTIAL_PROVIDER_ID = "credential";

/** Better Auth plugin id that provisions the development member. */
export const DEV_SIGN_IN_PLUGIN_ID = "tutribu-dev-sign-in";

/** Result of a development sign-in attempt. */
export type DevSignInResult = "failed" | "invalid-credentials" | "signed-in";

/** Results of a development sign-in attempt, mapped to Spanish copy by the form. */
export const DEV_SIGN_IN_RESULT = {
  failed: "failed",
  invalidCredentials: "invalid-credentials",
  signedIn: "signed-in",
} as const satisfies Record<string, DevSignInResult>;

/**
 * HTTP statuses Better Auth answers when the email or password is rejected:
 * a wrong password, or an email other than the development member.
 */
export const DEV_SIGN_IN_REJECTED_HTTP_STATUS = {
  forbidden: 403,
  unauthorized: 401,
} as const;
