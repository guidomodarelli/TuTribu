# Persistencia y carreras de comprobación local

Auditoría de T096 sobre `17921b67`. El inventario conserva 113 tareas completadas y 99 pendientes de 212 hasta terminar la comprobación de sus cláusulas. Código de producto, contratos y políticas no cambian en este incremento.

## Evidencia terminal disponible

- Cuatro suites nativas de persistencia: nueve casos verdes, cero omisiones. `admission-proof-application.test.ts`: cinco en 220,36 s, con contacto ausente o declarado, contacto distinto/versión stale, proof fresca cuando el código ya venció, proof vencida/invalidada, owner previo y rollback de request/proof/binding/audit/ledger.
- `admission-submit-proof-persistence.test.ts`: un caso verde en 135,34 s. La primera presentación consume prueba y fija vínculo en el mismo commit; replay no crea otra solicitud, vínculo o membresía.
- `admission-proof-operation-persistence.test.ts`: un caso verde en 158,99 s. Primera adjunción a la misma pending, COMMIT confirmado con respuesta perdida, recuperación/replay del original y fechas originales conservadas, sin aprobación o membresía implícitas.
- `admission-phone-pending-proof.test.ts`: dos casos verdes en 283,58 s. SMS/WhatsApp aplican el primer teléfono a la pending sin contacto, mantienen sus fechas/version histórica y rechazan reemplazo posterior sin nuevos efectos.
- La barrera de contención ya existente se extrajo a `withAdmissionTransitionContention`, reutilizada por borrado y cambio de política. Conserva horizon SQL de sesenta segundos, heartbeat que mantiene el guard de inactividad, observación de `pg_blocking_pids`, liberación única y settlement de todas las transacciones; sólo el caller elige la transición real.
- Regresión de borrado con la barrera extraída: proof local verde en 130,59 s; base verde final en 38,96 s. El primer caso base no se acredita como verde: sus aserciones terminaron, pero la limpieza no confirmó ausencia. Se comprobó después identidad/creación/parent/default, estado ready, ausencia de hijos y operaciones activas de esa rama propia; la limpieza revalidada confirmó su ausencia antes del ensayo final fresco. No se tocó default/producción ni otra rama.

## Carreras de época y conexión

`admission-proof-policy-race.test.ts` prepara cuenta/sesión del líder, confirmación reciente ligada a `updateAdmissionPolicy`, una pending histórica y una proof local real. La transición retiene la fila de tribu y ejecuta `PostgresAdmissionPolicyRepository`, con autorización, ledger, uso, readiness e invalidación reales; sólo el preflight de otro owner es un puerto controlado. El commit se libera después de observar la espera PostgreSQL del intento de adjunción.

La variante de época apaga y vuelve a encender ON mediante dos comandos versionados. La variante de conexión prepara versión dos con credencial sintética cifrada y capacidad email, selecciona esa versión y cambia la política mediante el escritor. Deben rechazar la proof anterior, conservar la solicitud completa/plazo original y no crear vínculo, auditoría de adjunción o membresía.

La primera corrida registró dos errores de arnés: el callback de preparación omitía la operación y derivaba `read_policy` frente a `configure_policy`, y la capacidad escribía `prepared_at` en lugar de `tested_at`. La revisión confirmó ambos P2, con tres hashes estables y manifiesto `B9172BE7F877DBA702C7C9785889258E67F6B995D3FFD3FB2CA45568BC89D172`. Se corrigieron los dos campos de wiring sin relajar autorización/recencia ni modificar producción. Tipos de tests y lint finales verdes. La repetición nativa y la revisión del fix se acreditan sólo después de su resultado terminal.

La repetición del wiring confirmó conexión en 158,31 s y dejó rojo época: la preparación de dos comandos reales consumía la ventana de observación iniciada antes de preparar. La barrera ahora toma deadline/PID después del staging y mantiene los mismos sesenta segundos para observar/liberar, sin ampliar guards SQL o cambiar la fecha de prueba/solicitud. Se repiten las dos carreras y ambas regresiones de borrado sobre esa extracción final; no se atribuye verde al caso de época anterior.

La extracción final confirma época en 175,39 s y conexión en 160,55 s, con espera PostgreSQL observada antes del commit de la transición. La solicitud completa permanece idéntica, la proof anterior queda invalidada sin application y no aparece vínculo, auditoría de adjunción o miembro. La regresión de borrado local pasó en 134,52 s. Base volvió a fallar exclusivamente al confirmar limpieza; se revalidó la nueva rama propia y se confirmó su ausencia. La repetición aislada final sobre el mismo código pasó en 37,71 s con cleanup confirmado. El conjunto agregado rojo no se describe como una suite completamente verde.

La revisión final del código corrigió ambos P2 y no encontró adicionales; HEAD `17921b67`, tres hashes estables, manifiesto `CD32B3A92845EABC0C59DC5E4E6B4A401AF156AEE832CD50A557C0514B5E4C5E`. Tipos de tests/lint posteriores al ajuste de deadline también pasan. La cláusula de resend conserva su comprobación seleccionada en curso; T096 aún no se cierra por este checkpoint.

La cobertura de desafío, resend, cinco fallos, ventanas y propósito diagnóstico de T095 conserva [contact-verification-requirements-baseline.md](contact-verification-requirements-baseline.md). El resend preserva evidencia aplicada y pending, y el conflicto de owner conserva su entidad independiente; se cotejan con los consumidores actuales antes del cierre integral de T096. UI, entregas externas, eliminación de tribu y mantenimiento general conservan sus tareas y gates.
