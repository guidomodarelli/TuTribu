# Exposiciones administrativas de admisión

Avance sobre `07c809a6c81acb5f119109b2ba357d655ef3c2f8`. Las 212 tareas originales conservan 164 completadas y 48 pendientes. T169/T170 no se completan con este avance: todavía faltan otros productores, exposiciones, instrumentación de workers, retención, pantallas y gates.

## Recorridos implementados

Los readers reales de habilitados, imports/reportes, invitaciones y revisión registran el acceso autorizado después de mapear y guardar su DTO propio. El hecho permanece en la misma transacción, con actor, tribu, recurso, versión real o ausencia de versión agregada, regla y reloj SQL. Sólo agrega superficie, cantidad y clase del recurso. No copia contacto, nombre, CSV, token, motivo, fingerprint ni payload.

La función definer tiene búsqueda fija y scope actual; habilitados, imports e invitaciones exigen líder, y revisión conserva líder/guardián. El import conserva iniciador y vigencia. Recurso cruzado, versión incorrecta, superficie inválida, extensión excesiva y sesión vencida no producen un registro. El helper distingue una sesión vencida de un rechazo de permisos. No concede escritura general de auditoría ni crea otro ledger o efecto de negocio.

El bloqueo inicial de revisión, actividad y métricas fija tribu, usuario y sesión antes de la pertenencia. La nueva exposición reutiliza ese orden. La FK de actor no intenta adquirir user después de una sesión retenida sin haber fijado ese usuario primero.

## Evidencia

- Cincuenta y cinco tests locales aprobados sin fallos ni filtros: contrato de auditoría, métricas y límites/proyección HTTP.
- Dieciséis casos PostgreSQL distintos aprobados entre los informes de readers, owners, regresión y equivalente de actividad/métricas. Incluyen comando real de 61 migraciones y replay, filtros/cursor, roles y sesiones, imports con bloques parciales, administración de invitaciones, metadata segura, NOBYPASSRLS, consumo e intentos, rollback/expiración y bloqueo concurrente.
- La regresión usa Pool, Drizzle y el reader reales. Observa de forma acotada el waiter de DELETE en PostgreSQL, permite otra lectura bajo el user ya fijado, libera el commit y confirma el borrado físico del guardián sin deadlock. La transacción de borrado se revierte para conservar las aserciones del fixture.
- Tipos de producto/tests y lint aprobados. El build real de Next termina con código cero en un worktree aislado, con dependencias propias y entorno sintético, sin usar la rama ni las claves del piloto.

## Diagnósticos y correcciones conservados

El primer 0/2 falló al crear la función; `pg` confirmó SQL42601, rutina `scanner_yyerror`, posición 796. Se delimita el CASE de la condición sin modificar el límite.

La repetición inicial terminó 4/1: el fixture de importación no tenía sus migraciones previas. `pg` confirmó SQL42703 `errorMissingColumn` al consultar únicamente la estructura. Se incorporaron las migraciones reales de progreso y digest; la repetición de owners terminó 6/0.

La revisión identificó un ciclo de locks user/session. Dos conexiones pg reprodujeron SQL40P01 `DeadLockReport`: lectura con sesión retenida y FK de actor frente al user bloqueado por la otra transacción. Se corrigió desde la autorización inicial y se cubrió el caso equivalente de actividad/métricas. La repetición ampliada terminó 10/1: el único fallo era observar pg_locks antes de que DELETE hubiera llegado al lock. Se añadió una espera acotada basada en el waiter real; la regresión final terminó 1/0. Los fallos anteriores conservan sus resultados originales.

## Pendientes originales

No se agrega pantalla ni se cambian permisos, controles o acciones de los manuales actuales. El historial completo continúa restringido al líder. Recursos externos, secreto operativo, productores restantes, runs/fases completos, retención general de 180/365 días, mantenimiento programado, rollout y gates siguen requeridos.

No hubo envíos externos ni regeneración de protecciones del piloto. Su candidata cifrada y su rama se conservan. La arquitectura se documenta en `docs/architecture/academy-admissions.htm#admission-administrative-exposures`.
