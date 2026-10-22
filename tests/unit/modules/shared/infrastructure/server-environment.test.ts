/** @vitest-environment node */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getServerDatabaseEnvironment,
  getPostgresPoolMetricsEnvironment,
  getServerMaintenanceDatabaseEnvironment,
} from "@/src/modules/shared/infrastructure/database/server-environment";

const DATABASE_ENVIRONMENT_NAMES = [
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "DATABASE_MAINTENANCE_URL",
] as const;

describe("server database environment resolution", () => {
  const originalEnvironment: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of DATABASE_ENVIRONMENT_NAMES) {
      originalEnvironment[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of DATABASE_ENVIRONMENT_NAMES) {
      if (originalEnvironment[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = originalEnvironment[name];
      }
    }
  });

  describe("getServerMaintenanceDatabaseEnvironment", () => {
    it("prefers DATABASE_MAINTENANCE_URL over the migration and runtime connections", () => {
      process.env.DATABASE_MAINTENANCE_URL = "postgres://maintenance.example.com/db";
      process.env.DATABASE_MIGRATION_URL = "postgres://migration.example.com/db";
      process.env.DATABASE_URL = "postgres://runtime.example.com/db";

      expect(getServerMaintenanceDatabaseEnvironment()).toEqual({
        connectionString: "postgres://maintenance.example.com/db",
      });
    });

    it("falls back to the owner/migration connection when the maintenance connection is unset", () => {
      process.env.DATABASE_MIGRATION_URL = "postgres://migration.example.com/db";
      process.env.DATABASE_URL = "postgres://runtime.example.com/db";

      expect(
        getServerMaintenanceDatabaseEnvironment().connectionString
      ).toBe("postgres://migration.example.com/db");
    });

    it("treats a blank maintenance connection as unset so it falls through", () => {
      process.env.DATABASE_MAINTENANCE_URL = "   ";
      process.env.DATABASE_MIGRATION_URL = "postgres://migration.example.com/db";

      expect(
        getServerMaintenanceDatabaseEnvironment().connectionString
      ).toBe("postgres://migration.example.com/db");
    });

    it("falls back to DATABASE_URL when no privileged connection is configured", () => {
      process.env.DATABASE_URL = "postgres://runtime.example.com/db";

      expect(
        getServerMaintenanceDatabaseEnvironment().connectionString
      ).toBe("postgres://runtime.example.com/db");
    });

    it("throws when no database connection is configured", () => {
      expect(() => getServerMaintenanceDatabaseEnvironment()).toThrow(
        "Database environment is incomplete"
      );
    });
  });

  describe("getServerDatabaseEnvironment", () => {
    it("resolves the runtime connection from DATABASE_URL", () => {
      process.env.DATABASE_URL = "postgres://runtime.example.com/db";
      process.env.DATABASE_MAINTENANCE_URL = "postgres://maintenance.example.com/db";

      expect(getServerDatabaseEnvironment().connectionString).toBe(
        "postgres://runtime.example.com/db"
      );
    });

    it("throws when DATABASE_URL is missing", () => {
      expect(() => getServerDatabaseEnvironment()).toThrow(
        "Database environment is incomplete"
      );
    });
  });
});

describe("Postgres pool metrics environment", () => {
  const originalInterval = process.env.POSTGRES_POOL_METRICS_LOG_INTERVAL_MS;

  afterEach(() => {
    if (originalInterval === undefined) {
      delete process.env.POSTGRES_POOL_METRICS_LOG_INTERVAL_MS;
    } else {
      process.env.POSTGRES_POOL_METRICS_LOG_INTERVAL_MS = originalInterval;
    }
  });

  it("enables pool metrics with an interval of at least one second", () => {
    process.env.POSTGRES_POOL_METRICS_LOG_INTERVAL_MS = " 5000 ";

    expect(getPostgresPoolMetricsEnvironment()).toEqual({ logIntervalMilliseconds: 5000 });
  });

  it.each([undefined, "", "0", "999", "1500.5", "five seconds"])(
    "keeps pool metrics off for %s",
    (configuredValue) => {
      if (configuredValue === undefined) {
        delete process.env.POSTGRES_POOL_METRICS_LOG_INTERVAL_MS;
      } else {
        process.env.POSTGRES_POOL_METRICS_LOG_INTERVAL_MS = configuredValue;
      }

      expect(getPostgresPoolMetricsEnvironment()).toEqual({ logIntervalMilliseconds: null });
    }
  );
});
