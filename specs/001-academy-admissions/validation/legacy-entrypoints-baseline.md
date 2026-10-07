# Entradas históricas y checkout de membresía

**Feature**: `001-academy-admissions`. **Base**: `dc9479db759481455349aef936573967b2b14a0a`, con cambios locales de T027. Trazabilidad: `FR-001`, `FR-138`–`FR-140`, `TC-025`. La activación operativa y OG-06 conservan su gate.

## Cambio

El ingreso gratuito y la aceptación histórica de invitaciones comprueban el marcador irreversible bajo locks de tribu/settings/instancia. Una recuperación gratuita sólo restaura una instancia tribemate con motivo exclusivamente comercial y snapshot active/muted conocido. Conserva rol, identidad y fecha; conducta/remoción administrativa e historia desconocida no se recuperan.

Los nuevos checkouts públicos o por invitación requieren modo clásico sin protección y producto membership. La reserva vuelve a comprobar modo/producto después de la lectura inicial. El reintento comercial de una pertenencia existente conserva su camino también bajo protección; su confirmación utiliza la procedencia paga privada de T026.

El entrypoint HTTP compone un adapter del módulo con puertos propios. Valida params/JSON una sola vez antes de resolver colaboradores y valida su DTO público. JSON malformado, token de tipo incorrecto o campos de autoridad no terminan como un retry. Conserva hashes de invitación/intento, mensajes seguros en español y correlación; no expone causas, tokens ni payloads upstream. Se canonicaliza el slug en las dos aplicaciones de start/retry.

## Evidencia

La prueba SQL inicial reprodujo tres problemas: una invitación protegida intentaba escribir sin fuente y recibía PostgreSQL 23514, el checkout abierto en academia llegaba al puerto de proveedor y una recuperación gratuita perdía muted. La ampliación reprodujo otro 23514 al borrar policy y volver settings a legacy. El filtro explícito del marcador evita la escritura antes del INSERT.

La revisión nativa detectó además interpolación de un booleano opcional undefined; se normaliza a booleano definido. Se agregó cobertura SQL real de invitación paga clásica y retry protegido para ejercer esos caminos, además del abierto.

Las 117 pruebas locales pasan: 86 del repositorio/puertos existentes y 31 de aplicación/HTTP, con Request/Response y schemas reales. Las dos comprobaciones antiguas de orden textual SQL se sustituyen por aceptación concurrente y revocación observables en PostgreSQL. Sólo se doblan colaboradores propios; ninguna librería de plataforma, ORM o SDK se mockea. Lint y ambos chequeos de tipos pasan. La revisión final devuelve cero hallazgos, con diez hashes estables.

La validación SQL final pasó once escenarios en 283,91 segundos, sin skips ni fallos. El build normal de Next.js 16.3.4 pasó compilación, TypeScript y generación de cuarenta páginas. Cada escenario crea una rama Neon propia, aplica SQL versionado, usa datos sintéticos y comprueba su eliminación. Los puertos de pago son controlados: no hay cobros ni llamadas reales al proveedor.

La documentación de arquitectura, producto y el manual interno de ingreso se actualizaron junto al menú y el changelog. El checker de manuales no encontró errores; las dos advertencias son el visor local sin URL publicada y la ausencia de catálogo de traducciones. Se comprobaron enlaces relativos, carga con ancla, recarga/foco, hoja/Escape, Inicio, atajos, acordeones y enlace a pagos en Chromium y WebKit a 1280/390, sin desbordes ni errores de JavaScript. También se renderizaron los tres documentos de arquitectura/producto en ambos motores. Las ilustraciones existentes conservan su condición de esquema. La trazabilidad indica cambios locales sobre la base; no se publicaron manuales.

## Límites

Estos guardas no habilitan el evaluador completo, pantallas nuevas de configuración/solicitud, migraciones de producción ni activación por tribu. Bootstrap y los caminos clásicos permanecen disponibles en su ámbito. La tarea completa de cutover, inventario y preflight conserva sus dependencias y evidencia operativa pendiente.
