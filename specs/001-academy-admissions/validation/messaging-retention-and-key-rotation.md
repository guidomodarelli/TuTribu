# Retención, eliminación y continuidad de claves

T166 permanece abierta sobre `2cc60fdc`. Conserva el criterio original completo: retiro y purga de credenciales dentro de 24 horas, candidatas/borradores de siete días más eliminación en 24 horas, solicitudes terminales de 180 días y auditoría de 365 días, OTP de hasta diez minutos, eliminación de cuentas/tribus sin liberar vínculos necesarios, y rotación independiente de fingerprint, payload MAC y cipher sin reiniciar consumo ni revivir secretos retirados.

## Evidencia inicial actual

Las suites de crypto y payload de recuperación terminaron con 39 casos aprobados, cero fallidos y cero excluidos. Ejercen WebCrypto real, separación de propósitos, contexto autenticado, MAC de OTP, vencimiento original, claves retenidas/retiradas, época externa y linaje inmutable del payload. Este lote local no acredita por sí solo filas PostgreSQL, mantenimiento ni las ventanas completas de retención.

`messaging-retention-and-key-rotation.test.ts` añade dos contratos de rotación de payload para verificación y recuperación de avisos. Con WebCrypto real, la clave anterior retenida comprueba el tuple original, las firmas nuevas usan el keyId activo y quitar la clave anterior cierra la lectura sin fallback. Cambiar el plazo original invalida el MAC. La rotación conserva entorno/época/fingerprint y permite abrir la misma credencial con su cipher independiente, sin reemplazar BYOK. Ambos casos terminaron aprobados, sin fallos ni exclusiones, y los tipos específicos de tests pasaron. No acreditan todavía el bridge persistido/operativo ni mantenimiento de las ventanas completas.

La validación reciente de SecretStore de T165 aporta doce casos PostgreSQL/crypto actuales, incluidos retiro irreversible, deadline de purga, bytes destruidos con referencia conservada y reencriptado sin cambiar la credencial BYOK. Se reutiliza únicamente por su alcance; no se vuelve a sumar como una ejecución nueva ni completa T166.

Tres suites SQL de continuidad de contacto y eliminación de cuenta/tribu terminaron con cinco casos aprobados, cero fallidos y cero excluidos. Sus fuentes conservaron los hashes de inicio. El bridge mantiene un único subject y su consumo al retirar la clave anterior; una clave retirada sin bridge cierra una identidad nueva mientras exista consumo vigente. La eliminación de cuenta conserva una reserva mínima que otra cuenta no puede reclamar; la eliminación física de tribu se rechaza cuando destruiría identidad, configuración, membresía o procedencia de auditoría. Este último contrato se distingue del cierre/archivo autorizado de una tribu.

Las suites existentes de mantenimiento de credenciales y envelopes OTP terminaron con seis casos aprobados, cero fallidos y cero excluidos. Sus fuentes conservaron los hashes de inicio. La credencial retirada pierde sus bytes sin perder referencia/metadata; una respuesta de commit no confirmada se reconcilia sin restaurarlos y la revocación de autoridad antes del commit revierte la purga. El envelope de una entrega confirmada se destruye sin invalidar el MAC local ni cambiar el historial cobrado; un intento desconocido conserva su material vigente, mientras los vencidos se eliminan en lotes concurrentes acotados. El rol SQL ordinario y las banderas fabricadas no sustituyen la autoridad de mantenimiento.

## Contraste pendiente

| Criterio original | Estado inicial |
|---|---|
| Retiro inmediato y purga en 24 horas sin restauración de material | SecretStore actual y seis casos de owners de mantenimiento aprobados; falta integrar el contraste de todos los plazos y estados de la tarea. |
| Candidatas/borradores abandonados, siete días más 24 horas | La estructura y algunos deadlines existen; no hay evidencia completa del recorrido de expiración/purga. |
| Minimización de terminales a 180 días y auditoría a 365 días | No se localizaron todavía un owner completo ni pruebas de esas ventanas; requiere implementación/validación, sin asumir cobertura desde columnas o tipos. |
| OTP hasta diez minutos y material transitorio eliminado | Crypto actual y mantenimiento SQL aprobado para entrega confirmada, unknown vigente, vencidos, autoridad y reservas conservadas; falta el contraste de la matriz completa. |
| Eliminación de cuenta/tribu con reserva mínima de identidad | Cinco casos SQL completos acreditan continuidad/eliminación por su alcance; falta contrastar el cierre autorizado y toda la matriz de retención. |
| Bridges de fingerprint/payload y cipher separado | Crypto y linaje actuales; tres casos del bridge persistido de contacto aprobados. Falta comprobar la ventana completa del payload y el productor de rotación requerido por T168. |

Las tareas T168 y T171 conservan sus implementaciones y dependencias originales. Esta auditoría no marca T166 completa, no activa producción y no presenta plazos de producto como garantías externas o certificación legal.
