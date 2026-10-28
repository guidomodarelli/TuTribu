/** Decorates the real SDK database adapter without altering rows, callbacks, transaction mode or outcomes. @module private-auth-database-adapter */
import "server-only";
import type { DBAdapterInstance, DBTransactionAdapter } from "better-auth";
import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";
import { AUTH_DATABASE_OPERATION, type AuthDatabaseOperation } from "../../constants/auth-database-diagnostics";
import { AuthDatabaseOperationError } from "./auth-database-operation-error";
import { resolveBetterAuthLoggingContext } from "./better-auth-logger";

/** @param operation - The actual native adapter method. @param run - Original database work. @returns Its unchanged result. @throws The original business/redirect failure, or a privately caused safe database error. */
async function privateDatabaseCall<Result>(operation: AuthDatabaseOperation, run: () => Promise<Result>): Promise<Result> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AuthDatabaseOperationError || !(error instanceof DrizzleQueryError || error instanceof DatabaseError)) {
      throw error;
    }
    throw new AuthDatabaseOperationError(operation, error, resolveBetterAuthLoggingContext());
  }
}

/** @param adapter - Actual ordinary or transaction-local SDK adapter. @returns Its optional schema creator with database-only error protection, only when it has one. */
function privateCreateSchema(adapter: DBTransactionAdapter): Pick<DBTransactionAdapter, "createSchema"> {
  const createSchema = adapter.createSchema;
  if (!createSchema) return {};
  return {
    createSchema: (...parameters: Parameters<typeof createSchema>) =>
      privateDatabaseCall(AUTH_DATABASE_OPERATION.createSchema, () => createSchema.apply(adapter, parameters)),
  };
}

/** @param adapter - Actual ordinary or transaction-local SDK adapter. @returns The same metadata and native operations with database-only error protection. */
function privateTransactionAdapter(adapter: DBTransactionAdapter): DBTransactionAdapter {
  return {
    ...adapter,
    create: (data) => privateDatabaseCall(AUTH_DATABASE_OPERATION.create, () => adapter.create(data)),
    findOne: (data) => privateDatabaseCall(AUTH_DATABASE_OPERATION.findOne, () => adapter.findOne(data)),
    findMany: (data) => privateDatabaseCall(AUTH_DATABASE_OPERATION.findMany, () => adapter.findMany(data)),
    count: (data) => privateDatabaseCall(AUTH_DATABASE_OPERATION.count, () => adapter.count(data)),
    update: (data) => privateDatabaseCall(AUTH_DATABASE_OPERATION.update, () => adapter.update(data)),
    updateMany: (data) => privateDatabaseCall(AUTH_DATABASE_OPERATION.updateMany, () => adapter.updateMany(data)),
    delete: (data) => privateDatabaseCall(AUTH_DATABASE_OPERATION.delete, () => adapter.delete(data)),
    deleteMany: (data) => privateDatabaseCall(AUTH_DATABASE_OPERATION.deleteMany, () => adapter.deleteMany(data)),
    consumeOne: (data) => privateDatabaseCall(AUTH_DATABASE_OPERATION.consumeOne, () => adapter.consumeOne(data)),
    ...privateCreateSchema(adapter),
  };
}

/**
 * Keeps database causes private before either native contextual or singleton SDK diagnostics can inspect them.
 * @param createAdapter - The configured Drizzle factory, including its existing transaction setting.
 * @returns An SDK-compatible factory with unchanged query arguments, results and private cause identity.
 */
export function createPrivateAuthDatabaseAdapter(createAdapter: DBAdapterInstance): DBAdapterInstance {
  return (options) => {
    const adapter = createAdapter(options);
    return {
      ...privateTransactionAdapter(adapter),
      transaction: (callback) => privateDatabaseCall(AUTH_DATABASE_OPERATION.transaction, () =>
        adapter.transaction((transaction) => callback(privateTransactionAdapter(transaction)))),
    };
  };
}
