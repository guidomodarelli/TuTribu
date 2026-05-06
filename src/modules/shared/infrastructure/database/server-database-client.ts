import "server-only";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, PoolClient } from "pg";

import { getServerDatabaseEnvironment } from "./server-environment";

const DATABASE_CONTEXT_SETTING = {
  currentUserEmail: "app.current_user_email",
  currentUserId: "app.current_user_id",
} as const;
const DATABASE_TRANSACTION = {
  begin: "BEGIN",
  commit: "COMMIT",
  emptySettingValue: "",
  rollback: "ROLLBACK",
} as const;

type GlobalDatabase = typeof globalThis & {
  __tuTribuDatabasePool?: Pool;
};

export type RequestDatabaseContext = {
  email: string | null;
  userId: string | null;
};

function createRequestDatabase(client: PoolClient) {
  return drizzle(client);
}

export type RequestDatabase = ReturnType<typeof createRequestDatabase>;

function getDatabasePool() {
  const globalDatabase = globalThis as GlobalDatabase;

  if (!globalDatabase.__tuTribuDatabasePool) {
    const { connectionString } = getServerDatabaseEnvironment();
    globalDatabase.__tuTribuDatabasePool = new Pool({
      connectionString,
    });
  }

  return globalDatabase.__tuTribuDatabasePool;
}

export async function createServerDatabaseClient() {
  const pool = getDatabasePool();

  return {
    async withRequestContext<T>(
      context: RequestDatabaseContext,
      callback: (database: RequestDatabase) => Promise<T>
    ): Promise<T> {
      const client = await pool.connect();

      try {
        await client.query(DATABASE_TRANSACTION.begin);

        const database = createRequestDatabase(client);
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.currentUserId}, ${context.userId ?? DATABASE_TRANSACTION.emptySettingValue}, true)`
        );
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.currentUserEmail}, ${context.email ?? DATABASE_TRANSACTION.emptySettingValue}, true)`
        );

        const result = await callback(database);
        await client.query(DATABASE_TRANSACTION.commit);
        return result;
      } catch (error) {
        await client.query(DATABASE_TRANSACTION.rollback);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
