import { sql } from "drizzle-orm";
import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

/** Default for audit timestamps: current instant stored in UTC. */
export const UTC_NOW_SQL = sql`timezone('utc', now())`;

/** Maps PostgreSQL `bytea` values to `Uint8Array` without validating backend rows. */
export const binaryData = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/**
 * Builds the `id` primary key column shared by tables keyed by a random UUID.
 *
 * @returns A fresh column builder; call it once per table.
 */
export function uuidPrimaryKeyColumn() {
  return uuid("id").defaultRandom().primaryKey();
}

/**
 * Builds the required `created_at` column defaulting to the UTC insertion time.
 *
 * @returns A fresh column builder; call it once per table.
 */
export function createdAtColumn() {
  return timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL);
}

/**
 * Builds the required `updated_at` column defaulting to the UTC insertion time.
 *
 * @returns A fresh column builder; call it once per table.
 */
export function updatedAtColumn() {
  return timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL);
}
