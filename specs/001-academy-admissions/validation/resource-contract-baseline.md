# Base de contratos públicos y versiones

**Feature**: `001-academy-admissions`. **Base publicada**: `d3945a014d45c0302293e5b3ebc17f1ba3db9b8e`.

## Alcance implementado

Se agregaron schemas reales de input y DTO público por owner. `academy-admissions` define creación y cambios permitidos de lista/invitación; `messaging` define configuración de uso/países sin exigir una conexión previa. Los inputs propios son estrictos y las salidas propias eliminan campos fuera de su contrato. No se schema-validan filas PostgreSQL ni respuestas de SDKs.

Las mutaciones de recursos existentes exigen `expectedVersion` entero positivo, operación UUID y confirmación. Las creaciones rechazan una versión elegida por el browser o `expectedVersion=0`; la versión inicial será asignada por el writer. Metadata/replay de invitación no contiene token ni URL recuperable. La ausencia de política de uso es `not_configured`/`null`, sin versión ficticia.

El inicio explícito de política de uso solo acepta `operationId` y confirmación. Los defaults 100/200, países vacíos y versión 1 serán asignados por el writer sin reemplazar una configuración existente. Elegir países/cupos es un PUT posterior con `expectedVersion`, no un parámetro de creación.

Los países se normalizan y deben existir en el registro telefónico real; duplicados normalizados se rechazan. Lista vacía y cuota cero son inputs de configuración válidos, sin habilitar envíos por sí mismos. Los máximos funcionales y la independencia de conexión/época se conservan. Una invitación sin lista exige reconocimiento explícito; renombrarla no permite cambiar destinatario, vencimiento o token.

## Evidencia ejecutada

Pasaron 24 casos con Zod y `libphonenumber-js` reales, más lint y ambos chequeos de tipos. Los casos rechazan versión ausente, cero, negativa, fraccional, string o fuera del rango seguro; distinguen ausencia/presencia de política; verifican metadata allowlisted, país inexistente/duplicado, confirmación, límites, campos privados y versiones impuestas desde el browser.

La suite se escribió y ejecutó antes de crear los módulos; inicialmente faltaban esos imports. Después se comprobaron los contratos observables. El chequeo de tipos detectó que una tabla `it.each` estaba pasando países como argumentos separados; se corrigió a filas de objeto para comprobar los duplicados reales, y se repitió la suite con resultado verde.

La revisión nativa detectó que el schema de creación exigía países/cupos del browser. Se reprodujo el fallo con la solicitud válida de inicio `{ operationId, confirmed: true }`, luego se separó inicialización de edición. La versión corregida acepta el inicio y rechaza países/cupos aportados a ese POST.

## Ampliación de persistencia y ledger

Sobre `c448f2d6`, los contratos existentes se ejercieron junto con los defaults/CHECK reales de los tres recursos: crear sin version devuelve 1; version 0 devuelve 23514 y null devuelve 23502, con rollback de cada intento inválido. Pasaron 25 casos sin skips en 18,97 segundos en una rama propia. El caso adicional del ledger comprueba actor actual, tribu y tipo distintos sin divulgar replay de otra operación ni repetir efectos; pasó focalmente en 18,37 segundos. Los trece casos anteriores del ledger ya habían pasado sin skips en 210,53 segundos, incluido replay anterior a CAS obsoleto, intent/expectedVersion cambiado, histórico posterior, DTO sin URL y permiso actual en cada fase. La revisión nativa del bloque final cerró con cero hallazgos accionables y ocho hashes estables; lint y ambos tipos finales verdes, cero ramas propias restantes.

## Trabajo pendiente

T014 ya está completada por sus pruebas de HTTP/contexto. T016 está completada por contratos, defaults/CHECK y replay real con namespace/actor actuales. T044 conserva los demás DTOs/guards HTTP, handlers y audiences actuales pendientes. Los writers CAS específicos de cada historia y sus rutas/conflictos 409 siguen pendientes, aunque defaults/CHECK y replay del ledger ya tengan evidencia SQL. No se afirma que estos schemas solos eviten una carrera o autoricen una lectura sensible.

El incremento efectivo y la continuidad de consumo deben confirmarse mediante persistencia real; editar países no debe invalidar un código vigente ni resetear cuota. No se conectó una ruta ni se habilitó envío. Los gates siguen en [operational-gates.md](operational-gates.md). `spec.md`, `technical-contract.md`, identificadores normativos y checklists permanecen íntegros.
