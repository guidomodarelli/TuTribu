import { describe, it, expect } from "vitest";
import { ATTACHMENT_FILE } from "@/src/constants/attachment-files";
import {
  isAttachmentAssetId,
  isValidAttachmentUploadDeclaration,
  normalizeAttachmentFileName,
} from "@/src/modules/shared/application/attachments/attachment-upload-validation";

const VALID_DECLARATION = {
  fileName: "guia-de-estudio.pdf",
  fileSizeBytes: 1024,
  mimeType: "application/pdf",
};

describe("isAttachmentAssetId", () => {
  it("accepts a v4 UUID asset id", () => {
    expect(
      isAttachmentAssetId("a3bb189e-8bf9-4888-9912-ace4e6543002")
    ).toBe(true);
  });

  it("rejects values that are not UUID asset ids", () => {
    expect(isAttachmentAssetId("not-a-uuid")).toBe(false);
    expect(isAttachmentAssetId("")).toBe(false);
    expect(
      isAttachmentAssetId("a3bb189e-8bf9-4888-9912-ace4e6543002; drop")
    ).toBe(false);
  });
});

describe("normalizeAttachmentFileName", () => {
  it("trims the file name and maps absent values to an empty string", () => {
    expect(normalizeAttachmentFileName("  informe.pdf  ")).toBe("informe.pdf");
    expect(normalizeAttachmentFileName(null)).toBe("");
    expect(normalizeAttachmentFileName(undefined)).toBe("");
  });
});

describe("isValidAttachmentUploadDeclaration", () => {
  it("accepts an allowlisted type within the size ceiling", () => {
    expect(isValidAttachmentUploadDeclaration(VALID_DECLARATION)).toBe(true);
  });

  it("rejects MIME types outside the allowlist", () => {
    expect(
      isValidAttachmentUploadDeclaration({
        ...VALID_DECLARATION,
        mimeType: "application/x-msdownload",
      })
    ).toBe(false);
    expect(
      isValidAttachmentUploadDeclaration({
        ...VALID_DECLARATION,
        mimeType: "text/html",
      })
    ).toBe(false);
  });

  it("rejects blank or overlong file names", () => {
    expect(
      isValidAttachmentUploadDeclaration({
        ...VALID_DECLARATION,
        fileName: "   ",
      })
    ).toBe(false);
    expect(
      isValidAttachmentUploadDeclaration({
        ...VALID_DECLARATION,
        fileName: "a".repeat(ATTACHMENT_FILE.maxFileNameLength + 1),
      })
    ).toBe(false);
  });

  it("rejects sizes outside the (0, max] range", () => {
    expect(
      isValidAttachmentUploadDeclaration({
        ...VALID_DECLARATION,
        fileSizeBytes: 0,
      })
    ).toBe(false);
    expect(
      isValidAttachmentUploadDeclaration({
        ...VALID_DECLARATION,
        fileSizeBytes: ATTACHMENT_FILE.maxFileSizeBytes + 1,
      })
    ).toBe(false);
    expect(
      isValidAttachmentUploadDeclaration({
        ...VALID_DECLARATION,
        fileSizeBytes: Number.NaN,
      })
    ).toBe(false);
  });
});
