# Autoridad actual de cuenta, tribu y recurso de admisión

**Feature**: `001-academy-admissions`. **Base**: `cb35e82534653253975a73924b02c1dd52e453b7`. T028 y sus dependencias permanecen abiertas hasta la composición de historias y mantenimiento.

## Implementado

ResolveAdmissionContextUseCase consulta la cuenta global vigente mediante un puerto y resuelve actor/tribu antes de un recurso privado. Repite cuenta, sesión y rol tras las lecturas y muestrea el clock después de esperas. No recibe actor, rol ni verified desde un body. El contexto mínimo es privado y no autoriza por sí solo un writer ni un despacho.

La matriz vigente permite revisar a líder/guardián activos y consultar/cancelar/aportar prueba a la solicitud propia con sesión global, sin membership. La decisión sobre sí mismo y los ámbitos cruzados quedan cerrados. Las acciones sensibles fijan operación y familia de recurso del catálogo de auth; la evidencia debe coincidir con usuario, cuenta, sujeto, sesión, tribu, operación y recurso, con vigencia derivada de authenticatedAt firmado. Una lectura ordinaria de lista conserva audience leader; el writer sensible debe pedir explícitamente su operación de recencia. No se reutiliza recencia de otra acción ni una señal de contacto de la tribu.

PostgresAdmissionAuthorizationReader recibe el RequestDatabase guardado actual, sessionId privado y acción fija del servidor. Comprueba el actor SQL y obtiene tribu/sesión/membresía con locks; created_by no concede rol. Un no miembro conserva role/status null. Los recursos usan consultas estáticas por kind y scope tribu/id; solicitudes propias incluyen user_id, previews de importación incluyen actor. Revalida expiración SQL después de leer. No adquiere otro checkout, no consulta secreto/contacto completo y no aplica schema a filas PostgreSQL.

## Evidencia y alcance

Los tests se escribieron antes de los adapters y reprodujeron imports ausentes. Los dieciséis casos de application cubren sesión/rol/cuenta/tribu/recurso ajenos, falta de membership, autodecisión, pérdida de rol, cambio de sesión y expiración durante lectura, recencia exacta y tipos de recurso. Con los HTTP/contexto existentes pasaron setenta casos sin skips. Lint y ambos typechecks pasaron.

El primer fixture SQL asumió un campo evidence_kind inexistente y PostgreSQL devolvió 42703; se corrigió según la migración versionada a evidence_source y source, sin modificar producción ni el schema. La suite posterior pasó tres escenarios SQL sin skips en 41,86 segundos: líder distinto del creador y solicitante no miembro, guardian actual/tribu exacta y sesión revocada, recurso propio frente a ajeno y guardian sin acceso de líder. Fixtures sintéticos, sesiones locales de prueba y cleanup en ramas propias.

La revisión encontró que la condición retired_at NULL cerraba también consultas de metadata/alertas conservadas. Se reprodujo con PostgreSQL real: un líder autorizado recibió null para el id mínimo desconectado. Se acotó el requisito de no retiro a manage_connection. El cuarto caso verifica metadata de líder, alerta de guardian, rechazo sensible y tribu ajena. La suite completa posterior pasó cuatro casos sin skips en 57,27 segundos, con JSON4/4 y cero failed/pending. Lint y ambos tipos posteriores al fix pasaron. La re-revisión nativa cerró con cero hallazgos accionables, seis hashes estables y todos sus comandos finalizados. Se comprobó cero ramas propias restantes. Esto no recupera material retirado ni autoriza otro envío.

T017 queda completada por definición de puertos/contratos y dependencia T014 satisfecha: cuentas/auth/result privado; comandos/lecturas/escritura de admisión y membresía; resolución legítima por producto; obligaciones de avisos; contextos humanos/de intento con propósito, conexión, versión, entorno y correlación; puerto propio de países consumido por application sin DTOs ni SDK outward. La revisión acotada confirma esa definición, sin inferir implementación de writers, historias o gates.

Factories/entrypoints, consumidores de historias, revalidación final de cada writer/dispatch y el principal bearer de mantenimiento aún deben integrarse. No se activaron academias ni rutas, no hubo mensajes ni configuración externa y los gates operativos siguen cerrados. Spec/TC, checklists e identificadores normativos permanecen íntegros.

## Ampliación T028 sobre dc9479db

Se reprodujeron tres lecturas de conexión con sesión/clock inicial inválidos y un acceso permitido con environment distinto. El resolver ahora comparte la política pura de sesión de auth con admisión y comprueba environment/época propios antes de SecretStore. Los ochenta casos locales de contexto/HTTP/mantenimiento pasan con Request/Response, crypto y cron authorization reales; sólo se doblan lectores de puertos propios.

PostgresMessagingAuthorizationReader liga la sesión y la selección selected/candidate a la composición de servidor. Actor SQL, líder canónico, tenant/versión/contribuyente, flags y retiro actuales se resuelven bajo locks y clock SQL posterior. No selecciona ciphertext, plaintext ni payloads de proveedor. Tres SQL nuevos confirman líder distinto del creador, selección de versiones, rechazo de recurso ajeno y cierre por sesión retirada/vencida o liderazgo perdido; con los cuatro de admisión pasaron siete en 87,99 s. El rerun completo de mensajería confirmó los tres casos en 72,73 s, incluidos retiro de versión y candidata no vigente; no hay skips ni fallos y las ramas fueron eliminadas con verificación.

El authorizer de mantenimiento revalida el bearer existente contra la fuente viva, en comparación constante, cada vez que el repositorio lo requiere. Body/roles no autentican; ausencia, retirada y rotación cierran. No se inventa recencia humana ni se consulta una conexión para autenticar al principal. Roots/endpoints y driver operativos permanecen en sus tareas.

Lint, ambos typechecks y build normal de cuarenta páginas están verdes; la compilación final terminó en 8,5 s. La revisión nativa de nueve archivos terminó sin hallazgos, con hashes estables. Ambos documentos de arquitectura pasaron renders Chromium/WebKit a 390/1280 sin desbordes/errores. T017/T025/T014 están satisfechas y T028 queda completada como resolución/revalidación de autoridad; la composición en endpoints/drivers futuros y OG mantienen sus tareas.
