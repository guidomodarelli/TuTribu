# Creación de obligaciones y avisos internos auditada

Avance sobre `16d8010ca5654b19a94d8b024f5ca6d9b4eb730a`. El inventario original conserva 212 tareas, 164 completadas y 48 pendientes. T169/T170 permanecen abiertas por los demás productores, exposiciones, retención, interfaz y gates.

## Implementación

La obligación de aviso se crea junto con su hecho privado en la transacción del owner. Los comandos de solicitud y retiro de invitación suministran el ledger interno real, comprobado contra la tribu y el actor SQL actuales. Cobro, cierre y vencimiento mantienen origen nulo cuando no existe ese comando. La materialización se registra después del INSERT efectivo del aviso y conserva la procedencia de su obligación, sin reconstruir otro original por fecha o usuario.

La variante privada selecciona seis campos: obligación, solicitud, versión observada de solicitud, evento fuente, audiencia y duración. No copia destinatarios, contactos, título, contenido, código, token ni datos del proveedor. La versión del recurso queda nula porque la obligación y el aviso no tienen contador propio. El actor procede del contexto real de cada escritura y puede quedar nulo por mantenimiento o borrado posterior de la cuenta.

El reloj de materialización se toma después del INSERT con `clock_timestamp()`. El campo visible de fecha del aviso conserva su convención de almacenamiento basada en el inicio de la transacción y no se utiliza como muestra de este paso. La fase `notification` agrega únicamente duraciones registradas de la misma tribu. No acredita por sí sola SC-015 ni el plazo completo hasta que la persona ve su bandeja.

Las migraciones idx164/165 integran los owners existentes de pago, cierre y vencimiento. El archivo de una tribu eliminada selecciona los mismos seis campos. El índice privado deduplica hechos efectivos; un enqueue repetido no agrega registros y un rollback retira también la auditoría. El reader de actividad conserva sus permisos y la validación del DTO propio.

La resolución paga conserva su permiso de ejecución anterior y sus comprobaciones de comprobante aplicado, pertenencia legible y autoridad de cobro. Los helpers nuevos permanecen privados. El pin de la cuenta del actor precede al primer lock de tribu del repositorio completo mediante `lockSubscriptionMembershipTribes`; el owner de recuperación y el writer SQL independiente conservan esa protección antes de retener miembros.

Una prueba directa con `pg` reprodujo `40P01` / `DeadLockReport` cuando el source retenía la tribu y el borrado retenía primero la cuenta creadora. PostgreSQL confirmó `tribes_created_by_fkey` con borrado NO ACTION y el rechazo `23503` / `ri_ReportViolation`. La corrección conserva la restricción de borrado y permite que la recuperación continúe después del rollback; no habilita eliminar recursos propios por esa vía. La rama de diagnóstico quedó eliminada con recibo y metadatos exactos, conservando producción y piloto.

## Validación

- Pasan 57 casos locales de proyección privada, agregados y contrato HTTP propio, sin fallos ni filtros.
- Pasan 34 casos PostgreSQL distintos: ocho de almacenamiento/materialización, seis de migraciones y reader, nueve de lifecycle e invitaciones, ocho de pago/rollback/concurrencia directa y tres de repositorios completos. Las repeticiones del comando real de 65 migraciones y su replay también aprueban y no se suman como casos nuevos.
- El recorrido real conserva el ledger de presentación, rechaza el original de otro actor, deduplica el enqueue y revierte audit/aviso junto con su transacción. Verifica el reloj posterior al INSERT y las muestras reales de la fase `notification`, junto con cancelación, expiración y el archivo después de borrar una tribu.
- La resolución paga con comprobante aplicado funciona bajo `NOBYPASSRLS`; un comprobante inventado sigue rechazado. Los tres owners de pago preservan el ingreso personal consumido y su historia comercial; el rollback posterior al staging retira también los hechos de auditoría del aviso.
- La concurrencia cubre un borrado después del staging y un borrado que retiene primero la cuenta creadora. Esta última secuencia se ejerce con el helper, el writer SQL independiente y los repositorios completos de precio, diagnóstico y webhook. El monitor obtiene el PID dentro de la transacción para que el pooler no cambie el backend observado.
- Se conservan los informes de preparación fallida del actor histórico, el 5/1 de observación y el diagnóstico nativo `40P01`. El fixture respeta el corte irreversible; la corrección del monitor conserva sus límites y aserciones. La repetición directa aprueba 8/0/0 y la de callers completos 3/0/0.
- Tipos de producto/tests, lint y build real de Next pasan. Las doce fuentes de producto y los veintisiete archivos de código/SQL/tests coinciden con la copia del build. La sección de arquitectura pasa en Chromium y WebKit a 390 y 1280 píxeles, sin desbordes, errores de página ni enlaces rotos; se inspeccionan las capturas móviles.
- La revisión final de Codex queda sin hallazgos accionables con 27 hashes estables, después de corregir la ACL paga y los locks del actor en el primer caller real. Las ramas de prueba y diagnóstico quedaron ausentes; Neon conserva únicamente producción y el piloto protegido.

## Alcance pendiente

No se activa correo externo, scheduler ni un envío real. El piloto conserva su candidata cifrada y sus protecciones existentes; no se regeneran claves. Siguen pendientes otros productores, retención, interfaces, programación, mediciones operativas y gates del plan. Este incremento no modifica pantallas, acciones, roles ni recorridos descritos por los manuales internos.

Documentación: `docs/architecture/academy-admissions.htm#admission-notification-creation-audit`.
