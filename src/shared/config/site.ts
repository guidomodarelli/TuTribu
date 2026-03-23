export const siteConfig = {
  name: "AcademiaOnline",
  description:
    "Base tecnica para una plataforma de comunidad inspirada en Skool y construida con Next.js.",
  platformNavigation: [
    { href: "/dashboard", label: "Panel" },
    { href: "/courses", label: "Cursos" },
    { href: "/community", label: "Comunidad" },
    { href: "/calendar", label: "Calendario" },
  ],
} as const;
