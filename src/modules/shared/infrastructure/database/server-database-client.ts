import "server-only";

import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Kysely } from "kysely";
import { Pool, PoolClient } from "pg";

import { createKyselyRequestDatabase } from "./kysely-request-database";
import type { KyselyRequestDatabaseSchema } from "./kysely-request-database-schema";
import { getServerDatabaseEnvironment } from "./server-environment";

const DATABASE_CONTEXT_SETTING = {
  currentUserEmail: "app.current_user_email",
  currentUserId: "app.current_user_id",
  mercadoPagoWebhookVerified: "app.mercado_pago_webhook_verified",
  ownerEmail: "app.owner_email",
} as const;
const DATABASE_RUNTIME_ROLE = "tutribu_rls_app";
const DATABASE_TRANSACTION = {
  begin: "BEGIN",
  commit: "COMMIT",
  emptySettingValue: "",
  rollback: "ROLLBACK",
  setLocalRuntimeRole: `SET LOCAL ROLE ${DATABASE_RUNTIME_ROLE}`,
  verifiedSettingValue: "true",
} as const;

type GlobalDatabase = typeof globalThis & {
  __tuTribuDatabasePool?: Pool;
};

export type RequestDatabaseContext = {
  email: string | null;
  mercadoPagoWebhookVerified?: boolean;
  userId: string | null;
};

type RequestDrizzleDatabase = NodePgDatabase<Record<string, never>> & {
  $client: PoolClient;
};

export type RequestDatabase = RequestDrizzleDatabase & {
  kysely: Kysely<KyselyRequestDatabaseSchema>;
};

function createRequestDatabase(client: PoolClient): RequestDatabase {
  const database: RequestDrizzleDatabase = drizzle(client);

  return Object.assign(database, {
    kysely: createKyselyRequestDatabase(client),
  });
}

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
  const { ownerEmail } = getServerDatabaseEnvironment();

  return {
    async withRequestContext<T>(
      context: RequestDatabaseContext,
      callback: (database: RequestDatabase) => Promise<T>
    ): Promise<T> {
      const client = await pool.connect();

      try {
        await client.query(DATABASE_TRANSACTION.begin);
        await client.query(DATABASE_TRANSACTION.setLocalRuntimeRole);

        const database = createRequestDatabase(client);
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.currentUserId}, ${context.userId ?? DATABASE_TRANSACTION.emptySettingValue}, true)`
        );
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.currentUserEmail}, ${context.email ?? DATABASE_TRANSACTION.emptySettingValue}, true)`
        );
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.ownerEmail}, ${ownerEmail}, true)`
        );
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.mercadoPagoWebhookVerified}, ${context.mercadoPagoWebhookVerified ? DATABASE_TRANSACTION.verifiedSettingValue : DATABASE_TRANSACTION.emptySettingValue}, true)`
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
