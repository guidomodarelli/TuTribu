import type { CourseDto } from "./course-dto";

export const courseMockDtos: CourseDto[] = [
  {
    id: "course-founder-os",
    title: "Sistema operativo del fundador",
    description:
      "Un framework practico para negocios liderados por comunidad que necesitan ritmo, claridad y ejecucion responsable.",
    category: "Estrategia",
    instructorName: "Mara Salvatierra",
    lessonCount: 12,
    status: "Open",
  },
  {
    id: "course-launch-lab",
    title: "Laboratorio de lanzamientos",
    description:
      "Un sistema repetible de lanzamiento para programas por cohorte, listas de espera y activacion posterior a la inscripcion.",
    category: "Crecimiento",
    instructorName: "Tomas Rivas",
    lessonCount: 9,
    status: "Scheduled",
  },
  {
    id: "course-community-ops",
    title: "Operaciones de comunidad semanales",
    description:
      "Rituales operativos y metricas que mantienen saludable a la comunidad sin sobrecomplicar el stack.",
    category: "Operaciones",
    instructorName: "Lucia Ferraro",
    lessonCount: 7,
    status: "Draft",
  },
];
