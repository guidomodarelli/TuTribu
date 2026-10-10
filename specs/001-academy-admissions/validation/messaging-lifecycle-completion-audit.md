# Auditoría del criterio completo de T137

Contraste backend sobre `77992a2e`, con T133/T134 cerradas. La revisión de sólo lectura verifica todo el criterio de T137 y sus cláusulas; no acredita UI, proveedor externo, transferencia de liderazgo de T138 ni gates operativos.

| Requisito | Evidencia alcanzable |
| --- | --- |
| Swap válido y selección anterior conservada hasta confirmar | Writer de activación y SQL91790/late98673: readiness, evidencia, dependencias y recencia se reevalúan bajo locks antes del reemplazo; versiones/trabajos antiguos no se redirigen. |
| Retiro ordinario coherente | Política pura y writer de desconexión: sólo después de reemplazo, política compatible o pausa, con avisos externos dependientes OFF. PostgreSQL bloquea dependencias y verifica retiro, replay y purga programada. |
| Permisos, recencia, versión y locks comunes | Autoridad nativa y authorizer SQL compartido, tribu antes de recursos y revalidación después de esperas. Contexto local sin SecretStore, SDK ni credencial; CAS e intent originales se conservan. |
| Suspensión urgente independiente | security_stop ejecuta el writer local sin disponibilidad del proveedor ni evaluación de retiro ordinario; conserva la verificación requerida y no promete retirar un mensaje aceptado. |
| Compromiso según causa y solicitud afectada | SQL18929 invalida desafíos/pruebas disponibles y exige nueva prueba para pendientes de esa conexión. El almacenamiento protegido aprobado de SQL12692 permanece intacto; no acredita la API de aprobación de US9. |
| OTP no aplicado y consumo/procedencia | Se cancela trabajo queued sin intento y se destruye sólo material afectado; accepted/unknown, reservas, versiones y consumo se conservan. No cambia credenciales de trabajos antiguos. |
| Atomicidad y recuperación | Rollback57084 revierte efectos antes de otro intent explícito; ledger conserva el original y sus resultados. HTTP87458 ejerce rutas reales con sesión/recencia, errores seguros y recuperación. |

Los resultados SQL/HTTP históricos y sus fallos previos se conservan en `messaging-lifecycle-baseline.md` y `messaging-connection-activation-baseline.md`. Se contrastan con los writers, guards y pruebas actuales; la revisión no se usa como ejecución de tests.

Validación local actual: cuatro suites, 20 verdes/cero fallos/cero omitidos (`.git/codex-t137-local-lifecycle-contracts.json`), mediante dominio, commands y puertos propios reales. Revisión Codex de 27 archivos: cero hallazgos accionables, SHA256 inicial/final `94635B01E72D2B8B74AD321AA92ABF55C9272E1A8310CEA1D5211C86A8D045A2`.

T137 se cierra por su alcance backend íntegro. Se conservan las tareas UI, T138/T139, retención y activación externa pendientes; los Native activos de lista e invitaciones no se atribuyen a este cierre. El conteo pasa a 129 completadas y 83 pendientes, sin cambiar los 212 IDs ni sus criterios.
