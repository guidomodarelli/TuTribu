import type { CommunityPostDto } from "./community-post-dto";

export const communityPostMockDtos: CommunityPostDto[] = [
  {
    id: "post-weekly-wins",
    title: "Avances semanales y notas de entrega",
    excerpt:
      "Los miembros usan este espacio para compartir que avanzo durante la semana y que aun necesita mejor ejecucion.",
    replyCount: 18,
    publishedAt: "Lunes, 17 de marzo",
    author: {
      id: "member-sofia",
      name: "Sofia Calderon",
      role: "Anfitrion de comunidad",
      avatarFallback: "SC",
    },
  },
  {
    id: "post-course-feedback",
    title: "Hilo de feedback para el nuevo modulo de lanzamiento",
    excerpt:
      "Un hilo enfocado en mejorar ritmo, ejemplos y notas de implementacion antes de abrir la siguiente cohorte.",
    replyCount: 9,
    publishedAt: "Miercoles, 19 de marzo",
    author: {
      id: "member-ramiro",
      name: "Ramiro Velez",
      role: "Mentor de crecimiento",
      avatarFallback: "RV",
    },
  },
  {
    id: "post-accountability",
    title: "Checkpoints de responsabilidad para builders",
    excerpt:
      "Los miembros documentan el compromiso que cerraran antes de la siguiente hora de consulta y por que importa ahora.",
    replyCount: 13,
    publishedAt: "Viernes, 21 de marzo",
    author: {
      id: "member-valentina",
      name: "Valentina Arias",
      role: "Miembro",
      avatarFallback: "VA",
    },
  },
];
