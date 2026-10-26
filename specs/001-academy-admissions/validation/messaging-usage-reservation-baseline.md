# Reservas y contadores de mensajería

**Feature**: `001-academy-admissions`. **Base**: `dc9479db759481455349aef936573967b2b14a0a`. T041 completa sus reservas/contadores privados; integración con UI, SDK de validación y hosting en tareas posteriores.

## Responsabilidades

Los envíos externos conservan la reserva junto a su marker en `authorize_messaging_delivery_attempt`: política/país/versión actuales, día UTC, mínimos de plataforma, categorías verification/notification y reserva consumida ante unknown. No se agrega una segunda reserva independiente para un mensaje. Solicitudes y fallos locales conservan sus contadores propios por cuenta/contacto y los mutex de continuidad de huellas; diagnóstico y SMS alternativo no reinician esos límites.

`ReserveMessagingUsageUseCase` agrega la categoría no facturable de validación de credenciales mediante el puerto `CredentialValidationBudget`. `PostgresCredentialValidationBudget` utiliza un executor protegido del actor y reutiliza la autorización real de sesión/cuenta/binding/recencia/líder canónico/recurso. Comprueba propósito validate, entorno/época/recovery y keyId actual sin descifrar material. Después de los mutex de operación y tribu toma tiempo SQL y cuenta diez reservas en hora móvil entre actores/versiones/claves. Revalida después de insertar y antes de confirmar; una retirada exige rollback.

El resultado `reserved` significa consumo nuevo confirmado. `already_reserved` describe el consumo original y no autoriza otro RPC. Una respuesta de commit perdida conserva error tipado y causa reales; la recuperación de la misma identidad no crea otro evento. Cambiar recurso/versión con esa identidad produce conflicto. Los límites y respuestas públicos usan códigos propios y copy español; el límite específico es HTTP 429, sin causa/status upstream en el cuerpo.

## Persistencia y datos históricos

La migración `20261006230000_bind_credential_validation_usage.sql` agrega fuente connection/version con FK de tribu, índice de ventana e identidad inmutable a eventos credential_validation. No reasigna historial desconocido. Eventos legacy unbound siguen contados; el CHECK acepta esa forma histórica para permitir anonimización y el trigger exige vínculo completo en todo INSERT nuevo. Un UPDATE no puede convertir una reserva histórica en otra identidad ni inventar su vínculo.

La anonimización del actor por `ON DELETE SET NULL` conserva la fecha, operación, tribu y consumo. El trigger permite actor NULL sólo cuando ese usuario ya no existe. El CHECK permanece NOT VALID para evitar un backfill o una validación masiva del historial; las escrituras nuevas están protegidas por CHECK y trigger. No se añaden contactos, ciphertext, tokens, claves ni cuerpos de mensajes a estos eventos.

## Evidencia ejecutada

Las pruebas se escribieron antes del adapter; el primer rojo fue su ausencia y no se atribuye a una ejecución SQL. Tras implementarlo pasaron cuatro SQL reales en 168,75 segundos. La ampliación de seis escenarios pasó en 241,33 segundos: dedupe y ausencia de mensajes/reservas de envío; carrera por el décimo cupo; versión nueva conserva cuota; acción/sesión/rol cerrados; rollback por recovery tras INSERT; y commit-reply perdida con recuperación original.

La revisión encontró un P2 real: el CHECK inicial NOT VALID bloqueaba borrar el actor de eventos legacy porque sus campos de recurso eran NULL. El caso adicional lo reprodujo con PostgreSQL 23514 en `messaging_usage_credential_scope_check` durante el `ON DELETE SET NULL`. Se corrigió separando la conservación histórica de los requisitos de INSERT nuevo. La suite final pasó doce SQL sin skips/fallos en 285,03 segundos: siete de credenciales y cinco de solicitudes. El séptimo confirma diez eventos históricos anonimizados sin cambiar id/tribu/fecha/operación, conserva el límite agotado y rechaza una reserva nueva sin vínculo. La revisión final del mismo proveedor terminó sin hallazgos accionables y trece hashes estables, sin ejecutar SQL ni editar.

Los cinco escenarios de solicitudes pasaron inicialmente en 136,26 segundos y se repitieron dentro de la suite final: cuenta/contacto hourly, diario UTC20, diagnóstico diario10, canal y keyrings disjuntos. El dataset diario refinado usa el inicio UTC, por separado para cuenta/contacto, fuera de la hora móvil y con zona Kiritimati; diagnóstico cambia de canal con hora/día Honolulu sin crear otro code_request. Antes de las primeras dos horas UTC ese test utiliza historia del día anterior para no atribuir una denegación aislada al contador equivocado. No se falsea el reloj SQL ni se omite el test. Los 69 locales finales de aplicación/HTTP/gestión de uso, lint y ambos typechecks pasaron. Build normal con configuración original y variables de proceso sintéticas: Node 24.21.0/Next 16.3.4, compilación 21,1 s, tipos 6,5 s y cuarenta páginas. Las tres páginas propietarias pasaron doce renders Chromium/WebKit a 390/1280 sin enlaces rotos, overflow o errores JavaScript; browsers cerrados.

## Integraciones pendientes

T081 conecta la reserva con la validación explícita y SDK fuera de locks; T087/T088 conectan cupos/paises con sus endpoints/UI. T186/T187 y gates conservan mantenimiento y hosting pendientes. Una reserva no valida una API key, prueba un canal o habilita admisiones. La retirada de material, cuotas cero, flags o países no confiere autoridad a un código o mensaje. No se enviaron mensajes reales, aplicaron migraciones en default/producción, publicaron recursos o modificaron manuales de un recorrido disponible ajeno al cambio.

Evidencia relacionada: [contact-verification-baseline.md](contact-verification-baseline.md), [messaging-persistence-baseline.md](messaging-persistence-baseline.md), [message-delivery-baseline.md](message-delivery-baseline.md) y [message-dispatch-baseline.md](message-dispatch-baseline.md). Decisión propietaria: [tenant-messaging.htm](../../../docs/architecture/tenant-messaging.htm).
