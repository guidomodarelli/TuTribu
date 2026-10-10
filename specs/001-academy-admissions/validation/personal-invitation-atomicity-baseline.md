# Canje y revocación nominativos — concurrencia real

Incremento de T122 sobre `820e0c9c`. T122 y sus dependencias conservan su estado pendiente hasta completar todos sus escenarios; este documento no reduce el objetivo de 212 tareas.

La carrera de revocación/canje usa cuentas, recencia, tokens, repositorios y transacciones PostgreSQL reales. Un holder de la fila de tribu se libera sólo después de observar dos transacciones bloqueadas mediante `pg_stat_activity` y `pg_blocking_pids`. No se reemplazan librerías, validators, SDK ni writers del producto. La barrera conserva el guard de idle y un plazo SQL independiente; termina sus transacciones incluso si falla la observación.

El escenario acepta ambos órdenes legales y comprueba sus efectos precisos. Si gana la revocación activa, no hay solicitud, vínculo ni membresía. Si gana el canje, la versión observada para revocar queda stale y la misma operación no puede convertirse en retiro de autorización; se exige UUID, versión y confirmación nuevos. El retiro explícito cancela la pending exacta y conserva el enlace canjeado sin expulsar a nadie.

## Evidencia

- Carrera real: un caso verde en 99,42 s, incluida limpieza de la rama propia `br-lively-block-an2pwr63`. Types de tests y lint verdes. No se acredita un orden de la carrera a partir del mero lanzamiento de dos promesas: el test exige observar dos waits reales antes de liberar el lock.
- Primer ensayo de cien confirmaciones: rojo en 302,95 s, con 76 fallos propios por agotamiento/timeout de checkout del pool configurado para 16 transacciones. Se conserva el resultado; no prueba todavía la muestra SC-005 completa. Las cien confirmaciones mantienen UUIDs distintos, el mismo destinatario y el mismo enlace.
- El siguiente ensayo usa la capacidad de cien transacciones soportada por el helper de la rama propia y agrega una salida de conteos de efectos antes de las aserciones. Conserva la exigencia de un solo canje, request, binding, decisión, membresía, fundamento y aviso, además de replay del original. No modifica la configuración productiva ni relaja las aserciones para ocultar los timeouts.
- Otros escenarios existentes de rollback, otra pending, versiones/replay y retirada después del canje conservan sus archivos/evidencia anteriores. Falta cerrar la ejecución de cien confirmaciones y completar la separación temporal entre expiry del enlace y expiry del request, los terminales no reciclables y la auditoría integral de T122.
