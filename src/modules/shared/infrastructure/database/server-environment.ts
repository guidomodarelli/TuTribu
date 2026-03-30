import "server-only";

const DATABASE_URL_ENV = "DATABASE_URL";
const DATABASE_ENVIRONMENT_ERROR_MESSAGE =
  "Database environment is incomplete. Set DATABASE_URL.";

export function getServerDatabaseEnvironment() {
  const connectionString = process.env[DATABASE_URL_ENV];

  if (!connectionString) {
    throw new Error(DATABASE_ENVIRONMENT_ERROR_MESSAGE);
  }

  return {
    connectionString,
  };
}
