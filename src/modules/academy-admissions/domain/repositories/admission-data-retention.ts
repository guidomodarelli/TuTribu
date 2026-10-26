/** Defines one atomic private batch across all admission data-retention owners. @module admission-data-retention */
import type { AllowlistImportMaterialRetentionResult } from "./allowlist-import-material-retention";
import type { AdmissionPrivateDataRetentionResult } from "./admission-private-data-retention";

/** Bounds each independent SQL owner without multiplying work by file or tribe. */
export type AdmissionDataRetentionCommand = { importRowLimit: number; requestLimit: number; auditLimit: number };
/** Contains only confirmed aggregate effects; it does not declare every queue exhausted. */
export type AdmissionDataRetentionResult = { importMaterial: AllowlistImportMaterialRetentionResult; privateData: AdmissionPrivateDataRetentionResult };

/** Keeps the entire admission batch private, atomic and independent from operational scheduling. */
export interface AdmissionDataRetention {
  /** @param command - Backend-owned independent ceilings. @returns Counts only after all effects commit together. */
  purge(command: AdmissionDataRetentionCommand): Promise<AdmissionDataRetentionResult>;
}
