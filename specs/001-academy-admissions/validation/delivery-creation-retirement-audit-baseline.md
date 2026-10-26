# Creación y cancelaciones locales auditadas

Avance de T169/T170 sobre `4367d040`. Se conserva el objetivo completo, con 164 completadas y 48 pendientes de 212 tareas; este avance no cambia marcadores ni cierra otros productores o gates.

## Responsabilidades y decisiones

- La emisión usa INSERT RETURNING para obtener el estado, versión, conexión/canal y reloj realmente persistidos de la entrega. Conserva actor y ledger internos verificados por el owner, y agrega `delivery_created` en la misma transacción antes de los chequeos finales. No convierte la política de cola en una reserva ni entrega evidencia de contacto a partir del transporte.
- El helper privado recibe únicamente filas efectivas de UPDATE RETURNING bajo el predicado queued/sin intento y el incremento version+1 ya existentes. El estado previo procede de ese predicado y su versión de ese único incremento; el estado/versiones/canal nuevos son los retornados. No cambia locks, CAS, plazos, carga criptográfica ni comportamiento externo. Escribe una colección, o nada para un conjunto vacío.
- Reenvío conserva la operación actual de reemplazo y la causa explicit_resend. Compromiso conserva actor/ledger sensible y suspected_compromise. Los resultados con intento y sus reservas permanecen intactos. No se registra una cancelación cuando el UPDATE no cambia una fila.
- El retiro de diagnóstico recibe actor/ledger explícitos del owner de configuración. El mantenimiento de candidata obtiene una vez el actor actual de su contexto SQL y conserva ledger nulo sin inventar una acción humana; mantiene el motivo candidate_expired y la versión seleccionada/historia de consumo. No se agregan defaults de actor o clave de cliente como FK.
- La metadata selecciona sólo estados, versión previa, conexión/versión/canal, intento y política realmente autorizada; estos dos últimos permanecen nulos en creación/cancelación sin intento. No conserva contacto, destinatario, sender, plantilla, código, sobre, credencial, intención congelada o payload del proveedor.
- El cambio de política no cancela directamente una entrega. Conserva su invalidación de evidencia y la supresión posterior del worker, ya auditada. Este trabajo no atribuye un efecto inexistente ni modifica esa regla para facilitar una prueba.

## Evidencia

- Tipos de producto/tests y lint terminaron con exit 0. Cuarenta y tres contratos locales aprobaron con cero fallos/filtros, incluyendo la nueva causa y su selección privada.
- Native de siete suites terminó con 32 aprobados, cero fallos y cero filtros sobre dieciséis archivos congelados: ocho de producto y ocho de tests/support. Los hashes coincidieron al terminar. Conserva los owners y matrices existentes y añade creación con reloj/ledger, cancelación con comando actual, mantenimiento sin ledger humano, no-op/replay y rollback. Los tests previos de marker/receipt incorporan explícitamente el nuevo hecho de creación y conservan sus comprobaciones de cuota, estado y duplicación; no se descartaron registros para hacerlos aprobar.
- Build aprobado en copia administrada sobre `4367d040`, con instalación offline/frozen y configuración sintética independiente sin copiar secretos reales. Ocho fuentes de producto coinciden con el original antes/después del build y con el manifest Native. La copia fue archivada oficialmente, y los metadatos adjuntos lo confirman.
- QA de arquitectura aprobó cuatro vistas Chromium/WebKit a 390/1280, sin overflow ni errores, con ancla única y enlace local accesible. Las dos capturas móviles fueron inspeccionadas. La sección no cambió después de esa comprobación.
- Treinta y dos receipts de ramas propias validaron proyecto, parent, nombre y no-default. El listado oficial completo confirmó cero ramas propias restantes y conserva `br-wispy-sun-anwpxm2x`. El piloto HTTPS respondió 200; no se reinició ni se alteraron sus keyrings/conexión y no se generaron mensajes externos nuevos.
- La revisión inicial del target de dieciocho archivos quedó sin hallazgos accionables y con hashes estables; no acreditó los resultados de Native/build que todavía no figuraban en esa evidencia. El cierre exige cero hallazgos aceptados contra el manifest final de diecinueve archivos, que incluye esta evidencia y el avance de tareas actualizados.

## Trabajo original que continúa

Se conservan pendientes otros productores y retiros SQL de ámbito/tribu, creación ordinaria de avisos, procedencia original de ciclo de vida, exposiciones, readers/endpoints/logger, agregados efectivos, actividad por rol, retención de auditoría 365 días y los demás plazos/rotation/rollout/gates. No se presenta la compilación o un conjunto estrecho de tests como cierre de esos criterios. T169/T170 permanecen abiertas.

El journal privado conserva acciones, permisos, estados y proyección pública del recorrido existente; no requiere reescribir manuales ajenos al cambio.
