# Transiciones de transporte y reconciliación auditadas

Avance de T169/T170 sobre `40378f6f`, sin cerrar sus demás criterios. El inventario original conserva 164 completadas y 48 pendientes, sobre 212 tareas.

## Owners y contratos

- La migración idx158 incorpora un helper de escritura privado y actualiza únicamente autorización de intento, resultado y recuperación de lease. Conserva las firmas y efectos originales. Los estados/versiones anteriores pertenecen a filas ya bloqueadas; los estados/versiones nuevos proceden del efecto persistido. El marker y la reserva están staged antes del registro de inicio. Supresión y aplazamiento por cupo no inventan intento ni política autorizada.
- El registro selecciona exactamente ocho campos de metadata: estados anterior/nuevo, versión anterior, conexión/versión/canal, intento y versión de política autorizada. El actor pertenece al contexto actual, admitiendo mantenimiento sin actor. El original usa el ledger interno conservado en la entrega o su creación/recuperación auditada con scope y FK reales; su ausencia permanece nula. No se coloca una clave de cliente en esa columna.
- El catálogo privado admite causas propias de receipt y SQL; un motivo no clasificado se omite. No conserva destinatario, contacto, proveedor, payload, código, intención congelada, lease, secreto ni etiqueta por cuenta/ID. No se revalidan filas PostgreSQL ni respuestas del SDK.
- La fecha de receipt es la misma persistida en el intento. La recuperación usa su reloj SQL; la repetición sin lease no duplica un hecho. Un resultado idéntico o stale conserva el journal sin nuevos registros. Los chequeos posteriores de autoridad/recovery siguen pudiendo revertir marker, reserva, receipt y registros juntos.
- El owner de reconciliación humana mantiene GET SDK fuera de la transacción; sólo un avance monotónico genera su hecho. Conserva el ledger original de entrega, actor/regla sensibles actuales y el reloj SQL de completado. No fabrica una nueva operación durable ni modifica cuotas, identidad de entrega o prueba de contacto.

## Verificación

- Tipos de producto/tests y lint terminaron con exit 0. Los dos últimos se repitieron después de corregir la fecha del fixture. Cuarenta y dos contratos locales terminaron con 0 fallos y 0 filtros, incluyendo las nuevas causas privadas y su proyección de metadata.
- Native inicial terminó con 16 aprobados, 1 fallo y 0 filtros sobre 17 casos. El fallo era `createdAt.getTime is not a function`: el timestamp de la consulta era texto, y ocurrió antes del INSERT del fixture vencido. No fue un rechazo de PostgreSQL ni se alteró el producer. Se normalizó con Date y se repitió sólo el caso fallido: 1 aprobado, 0 fallos y 11 filtros sobre los doce casos del archivo. Se conservan ambos resultados y sus manifests; no se presenta el resultado focal como una ejecución completa nueva.
- En conjunto aprobaron los 17 casos Native distintos: owners de entrega, cuatro layouts/resultados de reconciliación humana y secuencia real de 58 migraciones. Incluyen la matriz previa, cuota sin reserva, lease originalmente vencido sin marker, causa no clasificada, rollback del receipt, respuesta perdida, repetición/CAS y reloj/ledger reales. Los ocho archivos congelados de la repetición permanecieron idénticos al terminar.
- Build aprobado en copia administrada sobre `40378f6f`, con instalación offline/frozen y configuración sintética independiente sin secretos reales. Las tres fuentes de producto coinciden antes/después del build y permanecieron iguales durante la corrección del fixture. La copia fue archivada oficialmente, y los metadatos adjuntos lo confirman.
- QA de arquitectura aprobó cuatro vistas en Chromium/WebKit con anchos 390/1280, sin overflow ni page errors, con ancla única y enlace local accesible. Las dos capturas móviles fueron inspeccionadas; la sección no cambió después.
- Dieciocho receipts propios verificaron proyecto, parent, nombre y no-default; la consulta oficial completa confirmó cero ramas propias restantes y conserva `br-wispy-sun-anwpxm2x`. La primera comprobación HTTPS agotó diez segundos sin resultado HTTP; los dos procesos protegidos seguían activos. La repetición con plazo de treinta segundos respondió 200. No se reinició el piloto ni se alteraron sus keyrings/conexión, y no se generaron mensajes externos nuevos.
- La revisión inicial de once archivos estables no acredita el test corregido después. El cierre usa el manifest final de trece archivos e incluye fixtures y evidencia actualizados; exige cero hallazgos aceptados sobre ese target.

## Alcance conservado

Este avance no cierra la creación ordinaria y otros retiros de entregas, otros productores, exposiciones autorizadas, lectores/endpoints/logger, agregados efectivos, retención de auditoría por 365 días, pantallas, rollout ni gates. Tampoco cierra la procedencia de ciclo de vida de tribu ni el vencimiento persistido. T169/T170 siguen abiertas y no cambian marcadores.

El journal privado conserva el flujo, permisos y proyección visible existentes; no requiere reescribir manuales de otros recorridos. El piloto, sus keyrings y conexión guardada se conservan, con cero envíos externos nuevos.
