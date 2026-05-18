import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
  type QueryResult,
  type TransactionSettings,
} from "kysely";
import type { PoolClient } from "pg";

import type { KyselyRequestDatabaseSchema } from "./kysely-request-database-schema";

const KYSELY_REQUEST_DATABASE_ERROR = {
  unsupportedTransactionSettings:
    "Kysely request database transactions reuse the active request transaction and do not support custom transaction settings.",
  streamUnsupported: "Kysely request database does not support streaming queries.",
} as const;
const KYSELY_TRANSACTION_SAVEPOINT = "kysely_request_transaction";

class RequestPostgresConnection implements DatabaseConnection {
  constructor(private readonly client: PoolClient) {}

  async executeQuery<Row>(
    compiledQuery: CompiledQuery
  ): Promise<QueryResult<Row>> {
    const result = await this.client.query(
      compiledQuery.sql,
      [...compiledQuery.parameters]
    );

    return {
      numAffectedRows:
        result.rowCount === null ? undefined : BigInt(result.rowCount),
      rows: result.rows as Row[],
    };
  }

  async *streamQuery<Row>(): AsyncIterableIterator<QueryResult<Row>> {
    throw new Error(KYSELY_REQUEST_DATABASE_ERROR.streamUnsupported);
  }

  async executeRawSql(sql: string): Promise<void> {
    await this.client.query(sql);
  }
}

class RequestPostgresDriver implements Driver {
  private readonly connection: DatabaseConnection;
  private activeTransaction: {
    releaseLock: () => void;
    savepointName: string;
  } | null = null;
  private nextTransactionId = 1;
  private transactionLock = Promise.resolve();

  constructor(client: PoolClient) {
    this.connection = new RequestPostgresConnection(client);
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.connection;
  }

  async beginTransaction(
    connection: DatabaseConnection,
    settings: TransactionSettings
  ): Promise<void> {
    const releaseLock = await this.acquireTransactionLock();

    if (settings.accessMode || settings.isolationLevel) {
      releaseLock();
      throw new Error(
        KYSELY_REQUEST_DATABASE_ERROR.unsupportedTransactionSettings
      );
    }

    const savepointName = this.createSavepointName();

    try {
      await this.getRequestConnection(connection).executeRawSql(
        `SAVEPOINT ${savepointName}`
      );
      this.activeTransaction = {
        releaseLock,
        savepointName,
      };
    } catch (error) {
      releaseLock();
      throw error;
    }
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    const { releaseLock, savepointName } = this.getActiveTransaction();

    try {
      await this.getRequestConnection(connection).executeRawSql(
        `RELEASE SAVEPOINT ${savepointName}`
      );
    } finally {
      this.activeTransaction = null;
      releaseLock();
    }
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    const { releaseLock, savepointName } = this.getActiveTransaction();
    const requestConnection = this.getRequestConnection(connection);

    try {
      await requestConnection.executeRawSql(
        `ROLLBACK TO SAVEPOINT ${savepointName}`
      );
      await requestConnection.executeRawSql(
        `RELEASE SAVEPOINT ${savepointName}`
      );
    } finally {
      this.activeTransaction = null;
      releaseLock();
    }
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {}

  private async acquireTransactionLock() {
    const previousTransaction = this.transactionLock;
    let releaseLock!: () => void;

    this.transactionLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousTransaction;

    return releaseLock;
  }

  private createSavepointName() {
    const savepointName = `${KYSELY_TRANSACTION_SAVEPOINT}_${this.nextTransactionId}`;
    this.nextTransactionId += 1;

    return savepointName;
  }

  private getActiveTransaction() {
    if (!this.activeTransaction) {
      throw new Error("Kysely request database transaction was not started.");
    }

    return this.activeTransaction;
  }

  private getRequestConnection(connection: DatabaseConnection) {
    return connection as RequestPostgresConnection;
  }
}

class RequestPostgresDialect implements Dialect {
  constructor(private readonly client: PoolClient) {}

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createDriver(): Driver {
    return new RequestPostgresDriver(this.client);
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }

  createIntrospector(
    database: Kysely<KyselyRequestDatabaseSchema>
  ): DatabaseIntrospector {
    return new PostgresIntrospector(database);
  }
}

export function createKyselyRequestDatabase(client: PoolClient) {
  return new Kysely<KyselyRequestDatabaseSchema>({
    dialect: new RequestPostgresDialect(client),
  });
}
