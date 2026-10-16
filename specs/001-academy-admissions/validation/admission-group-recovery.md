# Recuperación explícita de grupos completos

Estado: implementación en validación. T185/T186 y las 31 tareas pendientes conservan su alcance; no se cierra ningún criterio por este documento.

## Alcance implementado

- El contenido genérico se proyecta antes de la criptografía. El formato 2 conserva todo el manifest y usa vínculos HMAC opacos del pagador y destinatario, separados por dominio y ligados a la entrega original.
- La autenticidad histórica del formato 2 puede comprobarse después de minimizar los datos del pagador. El despacho exige además las identidades y permisos actuales. El formato 1 conserva su transcript original y requiere los datos transitorios originales; no se reconstruyen identidades borradas.
- El owner de notificaciones comprueba todas las fuentes, rol, preferencia, correo confiable, habilitación y target preparado actuales en la transacción existente. El writer de mensajería conserva ledger/CAS, original, hijo, procedencia y auditoría atómicos.
- El nuevo hijo conserva asunto, texto, enlace pasivo, manifest y vencimiento exacto. El remitente y los vínculos nuevos corresponden al target actual. La composición entra por la ruta de recuperación existente.
- Los relojes nativos del hijo y su auditoría conservan el mismo instante. La guarda SQL existente permanece intacta. La preparación no reserva ni crea intentos o llamadas al proveedor.

## Evidencia disponible

- El CI del checkpoint padre `afffede0718fcec0fbc25a34e03298c69fb18b3a` terminó correctamente: 5.746 casos aprobados, 861 omitidos y 55 páginas compiladas. Ese CI corresponde al padre, no a los cambios locales de recuperación.
- La cohorte local actual del protocolo explícito y sus reglas conserva 93 casos aprobados, sin fallos u omitidos, en tres archivos completos. Incluye criptografía real, manipulación del contenido, ámbitos, vínculos, cambios de claves y compatibilidad del protocolo anterior.
- La primera cohorte Native terminó con un caso aprobado y uno fallido. El caso aprobado rechaza una composición incompleta. El positivo no acreditó recuperación confirmada.
- El diagnóstico posterior observó en PostgreSQL un hijo y operación completados dentro de la transacción, pero una diferencia de 149 microsegundos entre hijo y auditoría. El COMMIT produjo `23514` y la operación se revirtió. Fue un diagnóstico filtrado, con un caso fallido y otro fuera del filtro; no cuenta como recuperación aprobada.
- La corrección conserva en la auditoría el texto exacto de `created_at` devuelto por el INSERT del hijo, sin modificar la guarda diferida.
- La cohorte Native de dos archivos terminó correctamente: tres casos aprobados, sin fallos u omitidos y con todas sus fuentes originales estables. Comprueba la composición real de un grupo con dos fuentes, el rechazo de una composición incompleta y la recuperación después de transferencias canónicas y eliminación legítima del pagador no creador. El hijo conserva contenido, vencimiento y autoridad actuales; la auditoría usa el mismo reloj nativo. Preparar no produjo intentos, reservas ni mensajes reales.
- La primera revisión de código detectó la pérdida de precisión y la falta de esos dos recorridos Native. Ambos hallazgos se aceptaron. La revisión posterior terminó sin hallazgos accionables adicionales sobre los 21 archivos TypeScript modificados, con hashes estables. Fue una revisión de código; la evidencia SQL y el cierre documental se comprueban por separado.

## Pendientes para cerrar este incremento

- Consumir las dos cohortes originales de regresión SQL aún activas: cinco casos individuales y siete casos de preparación/autoridad del grupo. Corregir cualquier fallo antes de publicar.
- Completar las regresiones pertinentes, las validaciones de documentación y la revisión posterior con cero hallazgos accionables.
- Actualizar la trazabilidad del manual al commit de código comprobado y guardar los cambios mediante commits y push normales.

## Límites

Este incremento no activa productor protegido, recordatorio, mantenimiento, purga, programación o mediciones operativas. Tampoco acredita recepción externa, ejecución del hosting ni reenvío seguro de un intento `unknown`. No se repite el piloto real ni se aplican migraciones en producción.
