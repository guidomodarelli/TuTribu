/**
 * @jest-environment node
 */
import { formatFileSize } from "@/lib/format-file-size";
import { ATTACHMENT_FILE } from "@/src/constants/attachment-files";

const BYTES_PER_KILOBYTE = 1024;
const BYTES_PER_MEGABYTE = 1024 * 1024;

describe("formatFileSize", () => {
  it("formats plain byte counts without decimals", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1)).toBe("1 B");
    expect(formatFileSize(1023)).toBe("1.023 B");
  });

  it("scales to kilobytes and megabytes with at most one decimal", () => {
    expect(formatFileSize(BYTES_PER_KILOBYTE)).toBe("1 KB");
    expect(formatFileSize(850 * BYTES_PER_KILOBYTE)).toBe("850 KB");
    expect(formatFileSize(12.3 * BYTES_PER_MEGABYTE)).toBe("12,3 MB");
  });

  it("formats the attachment ceiling as a whole megabyte value", () => {
    expect(formatFileSize(ATTACHMENT_FILE.maxFileSizeBytes)).toBe("25 MB");
  });

  it("uses an es-AR comma as the decimal separator", () => {
    expect(formatFileSize(1.5 * BYTES_PER_KILOBYTE)).toBe("1,5 KB");
  });

  it("treats non-finite or negative input as an empty size", () => {
    expect(formatFileSize(Number.NaN)).toBe("0 B");
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe("0 B");
    expect(formatFileSize(-200)).toBe("0 B");
  });
});
