# Base de dominio de admisión

**Feature**: `001-academy-admissions`. **Fecha**: 2026-10-05. **Base publicada**: `3db6aa4a184dcd7e3f3bdd00973c702b5714c301`.

## Alcance implementado

Se agregaron primitivas puras de `academy-admissions`: normalización de contactos, configuración inicial cerrada, compatibilidad de modalidades, propuesta de cambios con versión/época, evaluación de nuevas presentaciones, revisión de pendientes y permisos por cuenta/tribu/rol actual. `MessagingUsagePolicyReader` define una proyección propia mínima; todavía no consulta persistencia ni llama al proveedor.

El dominio no escribe solicitudes, invitaciones, membresías, pruebas o notificaciones. Tampoco concede cursos, pagos o roles. Sus resultados son propuestas para los casos de uso y el escritor transaccional que aún deben construirse. No se conectaron nuevas rutas ni se activó la política de una tribu.

## Evidencia ejecutada

Con Node `24.21.0` y pnpm `12.6.0`, pasaron 96 casos en:

- `tests/unit/modules/academy-admissions/domain/admission-contact.test.ts`.
- `tests/unit/modules/academy-admissions/domain/admission-policy.test.ts`.
- `tests/unit/modules/academy-admissions/domain/admission-eligibility.test.ts`.

Los casos incluyen correo sin colapsar puntos/etiquetas, teléfono inequívoco/country coherente, los ocho renglones de configuración, los seis renglones de ingreso, evidencia base actual frente a cuenta/subject/email cambiados, códigos ON obligatorios, permisos actuales y aislamiento. También cubren miembros `active/muted` sin efectos, snapshots comerciales conocidos/desconocidos, roles privilegiados/conducta, configuración ausente o inválida, control no activado y rollback cerrado.

Las pruebas históricas de revisión distinguen una prueba aplicada de una disponible: conservan frescura histórica después de la presentación, exigen la época vigente cuando corresponde y verifican la solicitud exacta que consumió la prueba. Una invitación canjeada conserva autoridad mientras la solicitud siga vigente; su antiguo plazo no la vuelve a vencer. La revocación no se compensa apagando códigos ni cambiando de ruta silenciosamente. Las mutaciones obsoletas no se transforman en no-op y una pausa no depende de una capacidad externa disponible.

Pasaron `pnpm lint`, `pnpm typecheck` y `pnpm typecheck:tests`. Se observaron primero los rojos de comportamientos nuevos y después se completaron las primitivas. No se realizaron envíos reales ni SQL de negocio en este bloque.

## Trabajo todavía pendiente

T008, T017 y T020 continúan abiertos: este bloque prepara parte de su dominio y sus pruebas, sin dar por terminadas las tareas completas ni sus dependencias. Faltan puertos/contextos completos, contratos HTTP, migraciones/constraints, writers, integración de auth y escenarios de persistencia/concurrencia. Todos los gates OG-01 a OG-06 conservan el estado indicado en [operational-gates.md](operational-gates.md).

La convención de pruebas y el alcance de esta base están en [admission-testing.htm](../../../docs/conventions/admission-testing.htm) y [academy-admissions.htm](../../../docs/architecture/academy-admissions.htm). `spec.md`, `technical-contract.md`, los identificadores normativos y las checklists conservan su contenido.
