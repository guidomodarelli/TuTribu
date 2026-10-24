# Actividad y métricas de admisión

Este avance parte de `bb8ec62c159f1fb908a52baf6bbcdb37b1f200d9`. Mantiene las 212 tareas originales: 164 completadas y 48 pendientes. T169 y T170 permanecen abiertas; esta evidencia no acredita todos los productores, los plazos de retención, las pantallas ni los gates SC.

## Comportamiento implementado

- Consultas de actividad y métricas con cuenta y sesión nativas, liderazgo actual y scope de tribu. Guardián, no miembro, sesión vencida y resultado cruzado quedan cerrados.
- Actividad acotada con cursor SQL de microsegundos y UUID; conserva las reglas cerradas reales y las referencias de operación y ciclo de vida. La proyección selecciona campos propios y descarta motivos libres, contacto, código, ciphertext y credencial.
- Agregados SQL de solicitudes, decisiones, desafíos, entregas, intentos, leases, edades, errores cerrados y reservas consumidas del día UTC. Editar la política de uso no reinicia consumo. Los estados terminales conocidos conservan conteos de solicitudes y entregas al desaparecer las filas originales, sin duplicar las vivas.
- Exposición auditada sólo después del DTO propio utilizable, dentro de la transacción original. La función definer restringida usa actor, sesión y líder actuales, las dos superficies y metadata fija. La conexión request no recibe INSERT general en auditoría.
- Última expiración exitosa y duración a partir de efectos SQL realmente confirmados. El rollback retira los efectos y la observación; un catch-up vacío conserva el último hecho anterior. La tabla privada y su modelo Drizzle mantienen FORCE RLS, checks y el namespace propio.

## Validación y correcciones

Los 41 tests locales pasan sin fallos ni filtros; tipos de producto, tipos de tests y lint pasan. El build real de Next 16.3.4 termina con código cero en el worktree aislado, con dependencias propias y configuración sintética; incluye ambas rutas dinámicas. No usa la base del piloto ni sus claves de protección.

El primer fixture intentaba crear un guardián después del cutover. `pg` real confirmó SQL23514; se corrigió para crear la pertenencia legítima antes de activar, conservando la guarda productiva.

La primera revisión encontró que el reader completo intentaba INSERT invoker sobre auditoría con el rol sin bypass. La reproducción con `pg` confirmó SQL42501 y el recorrido completo falló. La función restringida corrige ese boundary sin conceder escrituras de tabla. Se agregaron positivos completos del reader con NOBYPASSRLS y negativos del registro para rol, vigencia de sesión, superficie y extensión. También se conservaron cinco reglas existentes que la proyección descartaba. La segunda revisión Codex cerró sin hallazgos y verificó 28 hashes estables.

La primera compilación aislada no inició Next porque el gestor de paquetes rechazó la unión de dependencias. Se instaló el lockfile en un directorio real. Se restauraron las referencias de dependencias del checkout principal antes de repetir la validación, conservando package.json y pnpm-lock.yaml. El informe Native anterior registró siete tests aprobados, pero el proceso terminó con un error de arranque posterior del entorno; no se cuenta como comando verde.

La repetición completa de PostgreSQL terminó con seis casos aprobados y uno fallido. La falla era una expectativa del fixture: ya contenía una solicitud vigente y otra vencida, por lo que después del rollback debían seguir dos pendientes. Se corrigió esa expectativa sin modificar el producto ni eliminar la solicitud vigente. La repetición focal final aprobó un caso, con el otro filtrado. Juntas acreditan siete casos Native distintos, incluyendo el comando real de sesenta migraciones y su replay, el reader completo sin bypass, consumo e intentos reales, rollback y éxito confirmado de expiración. Los fallos previos conservan su estado original.

La arquitectura se validó en Chromium y WebKit a 390 y 1280 píxeles: cuatro renders sin desbordes ni errores, con ancla única y enlace existente. Se inspeccionaron ambas capturas móviles. Los veinte archivos de producto, migración y journal coinciden con el código del build aislado antes del cierre.

## Límites y continuación

La pantalla de actividad y métricas no está creada y los manuales de flujos actuales no cambian. Los endpoints y contratos disponibles se documentan en `docs/architecture/academy-admissions.htm#scoped-admission-observations`.

Siguen pendientes productores y exposiciones adicionales, instrumentación completa de fases y otros workers, retención general de 180/365 días, seguridad transversal, UI, programación, rollout y gates. Las duraciones de operaciones e intentos no sustituyen las mediciones SC.

La rama del piloto conserva la candidata cifrada, pero su supervisor anterior está detenido y las claves de hosting originales no están disponibles localmente. No se recrea el arnés persistente ni se altera su candidata. Este avance no realiza envíos externos.
