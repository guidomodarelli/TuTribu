import { AsyncLocalStorage } from "node:async_hooks";
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
  type Transaction,
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

type RequestKyselyTransaction = {
  releaseLock: (() => void) | null;
  savepointName: string;
};

type RequestKyselyTransactionContext = {
  isInsideTransaction: boolean;
};
type KyselyTransactionBuilder = ReturnType<
  Kysely<KyselyRequestDatabaseSchema>["transaction"]
>;
type KyselyTransactionCallback<Result> = (
  transaction: Transaction<KyselyRequestDatabaseSchema>
) => Promise<Result>;
type KyselyTransactionExecute<Result> = (
  callback: KyselyTransactionCallback<Result>
) => Promise<Result>;

function isKyselyTransactionBuilder(
  value: unknown
): value is KyselyTransactionBuilder {
  return typeof value === "object" && value !== null && "execute" in value;
}

function wrapKyselyTransactionBuilder(
  builder: KyselyTransactionBuilder,
  driver: RequestPostgresDriver
): KyselyTransactionBuilder {
  return new Proxy(builder, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;

      if (property === "execute" && typeof value === "function") {
        return <Result>(callback: KyselyTransactionCallback<Result>) =>
          (value as KyselyTransactionExecute<Result>).call(
            target,
            (transaction) =>
              driver.executeTransactionCallback(() => callback(transaction))
          );
      }

      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const result = value.apply(target, args) as unknown;

          if (isKyselyTransactionBuilder(result)) {
            return wrapKyselyTransactionBuilder(result, driver);
          }

          return result;
        };
      }

      return value;
    },
  });
}

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
  private readonly activeTransactions: RequestKyselyTransaction[] = [];
  private readonly transactionContext =
    new AsyncLocalStorage<RequestKyselyTransactionContext>();
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
    const isNestedTransaction = this.isNestedTransaction();
    const releaseLock = isNestedTransaction
      ? null
      : await this.acquireTransactionLock();

    if (settings.accessMode || settings.isolationLevel) {
      releaseLock?.();
      throw new Error(
        KYSELY_REQUEST_DATABASE_ERROR.unsupportedTransactionSettings
      );
    }

    const savepointName = this.createSavepointName();

    try {
      await this.getRequestConnection(connection).executeRawSql(
        `SAVEPOINT ${savepointName}`
      );
      this.activeTransactions.push({
        releaseLock,
        savepointName,
      });
    } catch (error) {
      releaseLock?.();
      throw error;
    }
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    const { releaseLock, savepointName } = this.removeActiveTransaction();

    try {
      await this.getRequestConnection(connection).executeRawSql(
        `RELEASE SAVEPOINT ${savepointName}`
      );
    } finally {
      releaseLock?.();
    }
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    const { releaseLock, savepointName } = this.removeActiveTransaction();
    const requestConnection = this.getRequestConnection(connection);

    try {
      await requestConnection.executeRawSql(
        `ROLLBACK TO SAVEPOINT ${savepointName}`
      );
      await requestConnection.executeRawSql(
        `RELEASE SAVEPOINT ${savepointName}`
      );
    } finally {
      releaseLock?.();
    }
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {}

  async executeTransactionCallback<Result>(callback: () => Promise<Result>) {
    return this.transactionContext.run(
      { isInsideTransaction: true },
      callback
    );
  }

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

  private isNestedTransaction() {
    return (
      this.activeTransactions.length > 0 &&
      this.transactionContext.getStore()?.isInsideTransaction === true
    );
  }

  private removeActiveTransaction() {
    const activeTransaction = this.activeTransactions.pop();

    if (!activeTransaction) {
      throw new Error("Kysely request database transaction was not started.");
    }

    return activeTransaction;
  }

  private getRequestConnection(connection: DatabaseConnection) {
    return connection as RequestPostgresConnection;
  }
}

class RequestPostgresDialect implements Dialect {
  constructor(private readonly driver: RequestPostgresDriver) {}

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createDriver(): Driver {
    return this.driver;
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

class RequestKyselyDatabase extends Kysely<KyselyRequestDatabaseSchema> {
  constructor(
    dialect: Dialect,
    private readonly driver: RequestPostgresDriver
  ) {
    super({ dialect });
  }

  override transaction(): KyselyTransactionBuilder {
    return wrapKyselyTransactionBuilder(super.transaction(), this.driver);
  }
}

export function createKyselyRequestDatabase(
  client: PoolClient
): Kysely<KyselyRequestDatabaseSchema> {
  const driver = new RequestPostgresDriver(client);
  const dialect = new RequestPostgresDialect(driver);

  return new RequestKyselyDatabase(dialect, driver);
}
