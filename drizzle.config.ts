import type { Config } from "drizzle-kit";

const DATABASE_URL_ENV = "DATABASE_URL";
const DATABASE_URL_ERROR_MESSAGE =
  "Drizzle config requires DATABASE_URL to generate migrations.";

const connectionString = process.env[DATABASE_URL_ENV];

if (!connectionString) {
  throw new Error(DATABASE_URL_ERROR_MESSAGE);
}

export default {
  dbCredentials: {
    url: connectionString,
  },
  dialect: "postgresql",
  out: "./supabase/migrations",
  schema: "./src/modules/shared/infrastructure/database/schema.ts",
} satisfies Config;
