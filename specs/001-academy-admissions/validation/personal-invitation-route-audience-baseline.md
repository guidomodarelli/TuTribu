# T123 — audiencias y privacidad de rutas personales

Auditoría sobre `84eb6b2b`, sin cierre de páginas, UI, proveedores ni US4 completa. Los ensayos usan Next, Better Auth, sesiones firmadas y PostgreSQL reales en ramas propias; contratos y validators propios permanecen reales.

## Evidencia por cláusula

| Cláusula de T123 | Evidencia vigente |
| --- | --- |
| Audiencia de creación, historial, rename y revoke | `personal-invitation-management-http-flow.test.ts`: falta de sesión/recencia, líder actual, creación inicial/URL única, replay metadata-only, CAS, reemisión y revocación. Pérdida de liderazgo real retira historial, detalle y operación. |
| Lectura del token y cuenta incorrecta genérica | `personal-invitation-preview-http-flow.test.ts`: anónimo requiere sesión, destinatario actual obtiene preview sin contacto/nombre/token, otra cuenta recibe unavailable; lectura no crea challenge/request/binding ni canje. |
| Cabeceras e input/DTO propios | Ambos HTTP comprueban no-store/no-referrer; handlers ejercen Request/Response/Zod reales, rechazo previo a composición y contratos públicos no utilizables cerrados. |
| Props y diagnósticos por audiencia | `personal-invitation-page.test.ts` y `admission-http-boundaries.test.ts`: props indisponibles sin datos privados, mensajes/correlación seguros y exclusión de causas/payloads; el loader registra operación fija, no URL/token del caller. |

La URL inicial está permitida para el líder por FR-088. Un token ya presentado en el enlace es input y no concede permiso según FR-011; no equivale a una credencial de proveedor ni habilita revelar al destinatario.

- Reejecución Native HTTP actual: dos suites/dos casos verdes, sin skips/fallos, en 423,52 s; las dos ramas propias completaron su limpieza. Es la gestión administrativa y el preview real, no un doble del endpoint.
- Contratos focales: tres suites/26 casos verdes en 2,29 s, con puertos propios como únicos dobles. Las bibliotecas internas y de plataforma no se sustituyen.
- Revisión de sólo lectura: todas las cláusulas acreditadas, sin brechas obligatorias. Se preserva la separación de T123 frente a T124/T128–T132 y sus dependencias; no se presume la matriz visual ni el transporte externo.

Las rutas y contratos se organizan en los archivos anteriores en lugar del nombre de test único propuesto originalmente. Conservan todo el alcance de T123 y su recorrido real; el criterio de audiencia no se reduce a comprobar imports o schemas aislados.
