/** Owns exact native timestamp projection required by stable chronological pagination. @module notification-delivery-catalog-database */
/** Keeps PostgreSQL microseconds instead of rounding the cursor to JavaScript milliseconds. */
export const NOTIFICATION_DELIVERY_CATALOG_TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
