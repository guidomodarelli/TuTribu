# Retención privada de solicitudes y auditoría

Avance sobre `ec7f9bd7c959802a37cc203219bbfc30df462a51`. El objetivo conserva las 212 tareas originales; 164 completadas y 48 pendientes. Esta unidad implementa los owners de contenido terminal y auditoría de T171, sin cerrar por sí sola T166/T168/T169/T170/T171 ni los gates operativos.

## Contraste con el alcance completo

| Política | Implementación actual | Límite que permanece |
|---|---|---|
| CSV y reporte, 24 horas | Owner privado bounded ya compuesto y probado en su unidad, con conservación de filas/resultados | Programación operativa |
| Borrador/candidata de conexión, siete días y purga posterior de 24 horas | Expiración de versión candidata ya compuesta, con retiro original y conservación de seleccionada/consumos | Programación y cierre integral de mantenimiento |
| Credencial retirada, 24 horas | Purga privada de bytes y conservación de referencias ya implementadas | Composición operativa y restore/key rotation completos |
| Material OTP, menor necesidad y TTL | Purga privada existente y composición con recepción definitiva | Sweep periódico y plazo operativo |
| Mensajes/contactos innecesarios de solicitud terminal, 180 días | Owner nuevo de esta unidad; reloj de decisión, minimización irreversible y versiones/decisión/vínculo conservados | Integración con el driver completo |
| Auditoría de seguridad, 365 días | Owner nuevo para registros vivos y archivados, con un único límite global | Integración operativa y resto de productores/observaciones |

La política de siete días corresponde a la versión borrador/candidata que conserva una credencial temporal. No se sustituye por la vida de un formulario de navegador.

## Implementación

`buildAdmissionPrivateDataRetentionModule` compone el caso de uso con un ejecutor backend protegido, autorización viva y lectura del bloqueo de recuperación que no carga claves. La entrada acepta solamente dos límites. El owner comprueba la autoridad antes del checkout, dentro de la transacción y después del SQL; una retirada revierte todos los efectos antes de publicar resultados. La respuesta contiene únicamente contadores confirmados y existencia de trabajo restante. Un resultado indeterminado conserva `operation_unresolved` y la causa privada, sin reintento automático.

La migración idx166 fija cortes UTC de 180 y 365 días. Para solicitudes toma la decisión terminal original, no la presentación ni el reloj del host. Borra contacto duplicado, huella/keyId propios de la solicitud, mensaje de presentación y notas/respuesta de la decisión. Conserva estado, versión de negocio, fechas, decisión, evidencia mínima y referencias de vínculo/prueba. El marcador no se puede postergar o revertir; la decisión y la solicitud deben terminar sin esos contenidos en el mismo commit. Los writers ordinarios conservan su guarda de cambios efectivos y versión. Sólo la minimización privada validada puede retirar contenidos sin fabricar otra versión de negocio.

El worker conserva la autoridad mínima del contacto, incluida la huella reconocible después de eliminar la cuenta. No purga autorizaciones activas, canjes, ledgers, reservas o consumos. Los avisos internos existentes contienen tipo/referencias y payload vacío; su mensaje visible procede de los campos minimizados, sin reconstruir el contenido retirado.

La auditoría viva y archivada comparte el límite de filas. Los locks de fila usan `SKIP LOCKED` y los locks de ámbito usan `NOWAIT`: un ámbito ocupado conserva trabajo restante. La unión selecciona candidatos desde subconsultas con locks propios. PostgreSQL describe las restricciones de locks y subconsultas en [SELECT](https://www.postgresql.org/docs/current/sql-select.html); el parser real se comprueba además con `pg`.

Los hechos de retención incluyen únicamente owner, cantidad, existencia de trabajo restante y corte. Mantienen actor/operación/versión nulos de mantenimiento, sin copiar contactos ni mensajes. El archivo de una tribu eliminada selecciona esos mismos cuatro campos. La purga de auditoría considera su fecha original, sin renovar los 365 días al archivar.

## Evidencia comprobada

Se preservan los informes iniciales y sus causas: diferencia de microsegundos al crear una ventana de prueba con dos relojes, versión de vínculo incoherente y requisitos de obligación/audit de una decisión terminal. Se corrigen los fixtures, sin omitir los guards. Una lectura con `pg` confirma el reloj único y reproduce el rechazo `0A000` de un lock directo sobre una entrada de UNION, junto con la selección anidada aceptada.

Dieciséis casos locales y tres recorridos PostgreSQL distintos quedan aprobados. Cubren destrucción y repetición, RLS, lectura propia, vínculo criptográfico conservado, cuenta/tribu eliminadas, rollback por autoridad y bloqueo de recuperación retirados después de escribir, locks concurrentes, cortes UTC y confirmación de commit perdida sin repetir automáticamente. La secuencia real de 66 migraciones y su replay también pasa. Se conserva el informe inicial de la ampliación: locks/UTC pasó y la comprobación posterior al commit esperaba un objeto `Date` en SQL raw. La consulta final comprueba el marcador persistido como booleano junto con todos los contenidos nulos; la repetición focal pasa sin cambiar producto ni omitir guards.

Tipos de producto y tests, lint y build real con dependencias publicadas pasan. Las ocho fuentes de producto coinciden con la copia que produjo el build. La revisión final de catorce archivos no presenta hallazgos ni drift; el manifest tiene SHA256 `62d30747687556456639bba5cc7701802c7a63ea4fd74888950a33d276b9ffd8`. La copia de build quedó archivada mediante el gestor y su estado archivado fue confirmado.

La arquitectura, el manual de operaciones, el menú y el índice detallado pasan dieciséis vistas Chromium/WebKit a 390/1280 px, con enlaces locales, recarga con ancla, hoja del índice y regreso al menú, sin desbordes ni errores JavaScript. Dos capturas móviles se inspeccionan visualmente. Los dos manuales numerados pasan el checker sin errores. Sus advertencias de URL pública y traducciones corresponden a documentos locales y a la ausencia de catálogo central; la advertencia del script de navegación es un falso positivo del extractor del checker: ambos scripts coinciden íntegramente con el bloque vigente de `DESIGN.md`. No se crean capturas de aplicación ni controles ficticios para este owner sin UI.

La metadata final de Neon confirma únicamente producción y el piloto conservado; las ramas efímeras de estas pruebas ya no existen. No se ejecuta la limpieza sobre esos dos entornos.

## Alcance pendiente

No se ejecuta el mantenimiento sobre producción o el piloto. No hay mensajes externos ni cambios de keyrings del hosting. El proceso nuevo no agrega un botón de limpieza, endpoint público o scheduler. La reconciliación de backups/restore, rotación, el driver completo y sus ensayos conservan las tareas originales. Los plazos son decisiones del producto.
