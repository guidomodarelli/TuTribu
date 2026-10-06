# Lectura vigente de países por el puerto de admisión

**Feature**: `001-academy-admissions`. **Base**: `c448f2d619ac31fbeb9d8b6f9b36fb199733d89f`. T017/T046 continúan pendientes hasta completar dependencias y consumidores de historias.

## Responsabilidades y comportamiento

El owner de mensajería expone hechos internos mínimos mediante su puerto de dominio: tribu, versión, países y restricciones comprobadas. Su repositorio PostgreSQL recibe el RequestDatabase ya guardado y un authorizer obligatorio del owner. No adquiere otro checkout; consulta con locks compartidos y vuelve a autorizar tras las esperas. El caller debe haber fijado el orden comenzando por tribu y conservar la transacción durante la decisión. Ausencia devuelve null, sin versión ficticia, INSERT, conexión obligatoria o defaults persistidos.

Las restricciones se consumen desde capacidades comprobadas de la versión seleccionada y no retirada, mediante scope compuesto por tribu/conexión/versión. Se acotan únicamente los campos utilizados del JSON, sin schema de fila PostgreSQL o catálogo inventado del proveedor. No se expone credencial, consumo global, sender ni metadata de otra tribu. La lista editable sigue siendo únicamente messaging_usage_policies.allowed_countries.

El adapter de admisión implementa MessagingUsagePolicyReader y copia hechos propios; no importa DTOs de mensajería en application/domain. El consumidor de configuración obtiene esos hechos en cada llamada y reemplaza un snapshot viejo. Usa la matriz pura existente, de modo que lista vacía impide teléfono ON, restricción del canal elegido impide esa capacidad y manual/teléfono/OFF o correo mantienen sus reglas.

## Evidencia y alcance

Los tests precedieron al código y fallaron inicialmente por los adapters/consumer ausentes. Tres escenarios SQL reales pasaron en 86,43 segundos en ramas propias con fixtures sintéticos: ausencia/defaults sin conexión y actualización vigente; tribu ajena/rol cambiado; restricciones sólo de la versión seleccionada actual. El cuarto caso pasó focalmente en 12,13 segundos: rechazo de permiso temporal vencido después de leer los hechos, sin modificar países/versión. Los tres skips de esa ejecución corresponden al filtro de ese único caso, ya ejecutados antes sin skips. La regresión de application, matriz y DTOs reales pasó cincuenta casos. Ambos chequeos de tipos y lint finales pasaron.

La revisión encontró una restricción reconocible con allowed string false descartada silenciosamente, mientras el marker SQL la prohíbe. Se reprodujo con una fila JSONB real: el reader devolvió restricciones vacías en vez de cerrar. La corrección rechaza el campo mínimo no consumible con resource_unavailable, sin validar un schema completo de filas o respuesta de proveedor. La suite completa posterior pasó cinco escenarios sin skips en 60,94 segundos; el JSON acredita cinco passed y cero failed/pending. La revisión nativa final cerró con cero hallazgos accionables, ocho hashes estables y todos sus comandos finalizados. La lectura final de metadata de Neon acreditó cero ramas propias restantes.

La composición de candidata, los permisos concretos de cada historia, writes/GET públicos, configuraciones antes del diagnóstico y reserva/marker siguen pendientes. Estos colaboradores no autorizan por sí solos una activación ni un despacho. No hubo SDK, configuración externa, mensajes o SQL en una rama default/producción. Gates, spec.md, technical-contract.md, checklists e IDs normativos permanecen íntegros.
