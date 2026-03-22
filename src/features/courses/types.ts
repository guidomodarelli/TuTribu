export type CourseSummary = {
  id: string;
  title: string;
  description: string;
  category: string;
  instructorName: string;
  lessonCount: number;
  status: "Draft" | "Open" | "Scheduled";
};
