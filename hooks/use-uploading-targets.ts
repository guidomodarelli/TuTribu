import { useState } from "react";

/**
 * Tracks which upload targets (image fields, gallery rows) have an upload in
 * flight, so each one runs a single upload at a time.
 * @returns The targets being uploaded and the setter that marks or clears one.
 */
export function useUploadingTargets() {
  const [uploadingTargets, setUploadingTargets] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const setUploadingTarget = (target: string, isUploading: boolean) => {
    setUploadingTargets((currentTargets) => {
      const nextTargets = new Set(currentTargets);

      if (isUploading) {
        nextTargets.add(target);
      } else {
        nextTargets.delete(target);
      }

      return nextTargets;
    });
  };

  return { setUploadingTarget, uploadingTargets };
}
