/** Names native adapter operations without exposing SQL, parameters or stored values. @module auth-database-diagnostics-constants */
export type AuthDatabaseOperation = "create" | "findOne" | "findMany" | "count" | "update" | "updateMany" | "delete" | "deleteMany" | "consumeOne" | "transaction" | "createSchema";
/** Keeps the SDK-facing failure stable while retaining the actual cause privately. */
export const AUTH_DATABASE_DIAGNOSTIC = { name: "AuthDatabaseOperationError", code: "auth_database_operation_failed", message: "Authentication database operation failed." } as const;
/** The SDK's complete current adapter vocabulary, including its atomic single-use primitive. */
export const AUTH_DATABASE_OPERATION = { create: "create", findOne: "findOne", findMany: "findMany", count: "count", update: "update", updateMany: "updateMany", delete: "delete", deleteMany: "deleteMany", consumeOne: "consumeOne", transaction: "transaction", createSchema: "createSchema" } as const satisfies Record<string,AuthDatabaseOperation>;
