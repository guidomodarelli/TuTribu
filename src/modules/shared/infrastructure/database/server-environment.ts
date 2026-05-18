import "server-only";

const DATABASE_URL_ENV = "DATABASE_URL";
const OWNER_EMAIL_ENV = "TUTRIBU_OWNER_EMAIL";
const DATABASE_ENVIRONMENT_ERROR_MESSAGE =
  "Database environment is incomplete. Set DATABASE_URL.";

function normalizeOwnerEmail(ownerEmail: string | undefined): string {
  return ownerEmail?.trim().toLowerCase() ?? "";
}

export function getServerDatabaseEnvironment() {
  const connectionString = process.env[DATABASE_URL_ENV];

  if (!connectionString) {
    throw new Error(DATABASE_ENVIRONMENT_ERROR_MESSAGE);
  }

  return {
    connectionString,
    ownerEmail: normalizeOwnerEmail(process.env[OWNER_EMAIL_ENV]),
  };
}
