const VERCEL_ENVIRONMENT_VARIABLE = "VERCEL";
const ENABLED_ENVIRONMENT_VALUE = "1";

export type RuntimeEnvironment = Record<string, string | undefined>;

export function isVercelEnvironment(environment: RuntimeEnvironment = process.env): boolean {
  return environment[VERCEL_ENVIRONMENT_VARIABLE] === ENABLED_ENVIRONMENT_VALUE;
}
