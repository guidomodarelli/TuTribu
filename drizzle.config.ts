import { loadEnvConfig } from "@next/env";
import type { Config } from "drizzle-kit";

const DATABASE_URL_ENV = "DATABASE_URL";
const DATABASE_MIGRATION_URL_ENV = "DATABASE_MIGRATION_URL";
const DATABASE_URL_ERROR_MESSAGE =
  "Drizzle config requires DATABASE_MIGRATION_URL or DATABASE_URL to generate migrations.";
const DEVELOPMENT_NODE_ENV = "development";
const FORCE_ENVIRONMENT_RELOAD = true;

loadEnvConfig(
  process.cwd(),
  process.env.NODE_ENV === DEVELOPMENT_NODE_ENV,
  undefined,
  FORCE_ENVIRONMENT_RELOAD
);

function getOptionalEnvironmentValue(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value ? value : undefined;
}

const connectionString =
  getOptionalEnvironmentValue(DATABASE_MIGRATION_URL_ENV) ??
  getOptionalEnvironmentValue(DATABASE_URL_ENV);

if (!connectionString) {
  throw new Error(DATABASE_URL_ERROR_MESSAGE);
}

export default {
  dbCredentials: {
    url: connectionString,
  },
  dialect: "postgresql",
  out: "./database/migrations",
  schema: "./src/modules/shared/infrastructure/database/schema.ts",
} satisfies Config;
