import type { CourseDto } from "./course-dto";

export const courseMockDtos: CourseDto[] = [
  {
    id: "course-founder-os",
    title: "Founder Operating System",
    description:
      "A practical framework for community-led businesses that need rhythm, clarity, and accountable execution.",
    category: "Strategy",
    instructorName: "Mara Salvatierra",
    lessonCount: 12,
    status: "Open",
  },
  {
    id: "course-launch-lab",
    title: "Launch Lab",
    description:
      "A repeatable launch system for cohort programs, waitlists, and post-enrollment activation.",
    category: "Growth",
    instructorName: "Tomas Rivas",
    lessonCount: 9,
    status: "Scheduled",
  },
  {
    id: "course-community-ops",
    title: "Community Ops Weekly",
    description:
      "Operational rituals and metrics that keep a member community healthy without overcomplicating the stack.",
    category: "Operations",
    instructorName: "Lucia Ferraro",
    lessonCount: 7,
    status: "Draft",
  },
];
