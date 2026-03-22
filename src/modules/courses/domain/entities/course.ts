export type CourseStatus = "Draft" | "Open" | "Scheduled";

export type Course = {
  id: string;
  title: string;
  description: string;
  category: string;
  instructorName: string;
  lessonCount: number;
  status: CourseStatus;
};
