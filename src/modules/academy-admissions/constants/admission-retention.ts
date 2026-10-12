/** Bounds private temporary-file minimization independently of CSV size and public pagination. @module admission-retention-constants */
/** Counts rows rather than whole files so a large import cannot multiply the batch ceiling. */
export const ADMISSION_IMPORT_MATERIAL_RETENTION = { defaultRowLimit: 500, maximumRowLimit: 2_000, operation: "purge_allowlist_import_material" } as const;
