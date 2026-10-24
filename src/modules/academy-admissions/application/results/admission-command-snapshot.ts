/** Builds original command contracts without turning a completed rejection into success. @module admission-command-snapshot */
import { z } from "zod";
import { admissionCommandDenialSchema } from "../../constants/admission-command-denial-schema";

/** @param success - The owner's existing minimal confirmed success contract. @returns A guarded original success or business denial; technical failures cannot complete this contract. */
export function createAdmissionCommandSnapshotSchema<Result>(success: z.ZodType<Result>) {
  return z.union([success, admissionCommandDenialSchema]);
}
