export type CourseModule = {
  courseId: string;
  id: string;
  isActive: boolean;
  sortOrder: number;
  title: string;
  /**
   * Drip window in days since the member joined the tribe. `null` means the
   * module is available immediately.
   */
  unlockAfterDays: number | null;
};
