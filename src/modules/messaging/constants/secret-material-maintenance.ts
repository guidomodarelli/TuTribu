/** Bounds the private credential-material purge to the SQL owner's supported batch. @module secret-material-maintenance-constants */
export const SECRET_MATERIAL_PURGE = {maximumBatchSize:100,operation:"purge_retired_secret_material"} as const;
