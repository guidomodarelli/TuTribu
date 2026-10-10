# Persistencia y carreras de comprobación local

Auditoría de T096 sobre `47774561`, con carreras y extracción de barrera guardadas en ese commit. Código de producto, contratos y políticas no cambian en este incremento. La matriz conserva el alcance completo de T096 y mantiene las historias/gates restantes abiertos.

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

La revisión final del código corrigió ambos P2 y no encontró adicionales; HEAD `17921b67`, tres hashes estables, manifiesto `CD32B3A92845EABC0C59DC5E4E6B4A401AF156AEE832CD50A557C0514B5E4C5E`. Tipos de tests/lint posteriores al ajuste de deadline también pasan. En ese checkpoint de código, la comprobación seleccionada de resend todavía estaba en curso y T096 permanecía abierta. Su resultado terminal y el cierre documental actual se registran en la matriz siguiente.

## Matriz de cierre de T096

| Cláusula | Evidencia comprobada |
| --- | --- |
| Desafío actual, reenvío y fallos | T095 conserva seis casos SQL del validador y cinco del presupuesto. Reenvío seleccionado de `contact-verification-issuer.test.ts`: un caso nativo verde en 66,87 s, siete filtrados. Dos callers retienen lecturas compartidas antes de competir; sólo uno emite, invalida código/proof disponibles, conserva el fallo/eventos históricos y no reemplaza el marker, intento o reserva consumida anteriores. |
| Prueba de un uso y linaje | `admission-proof-persistence.test.ts`: un caso nativo verde en 40,46 s: sólo un desafío verificado de admission puede originar una proof; diagnóstico/desafío sin verificar/scope incompatible y reescritura de application se rechazan por guardas PostgreSQL. Aplicación/submit y replay conservan una sola proof aplicada y un solo vínculo. |
| Aplicación fresca hasta quince minutos | Cinco casos actuales de application incluyen código ya vencido con proof fresca aceptada y proof vencida/invalidada rechazada sin vínculo. El dominio ejercita exactamente applyBefore; el issuer nativo genera la ventana original de quince minutos y no la renueva al aplicar. |
| Vínculo al presentar | Submit nativo consume prueba y fija vínculo con la primera pending en un commit; pedir/verificar código permanece separado y sin pertenencia. La prueba de scope de T095 comprueba código local sin verificación global o nueva sesión. |
| Cuenta cruzada | `admission-verification-scope-isolation.test.ts` nativo de T095 rechaza cuenta/tribu/desafío ajenos sin consumo; writer/application rechazan actor SQL cruzado y owner previo sin cambiar prueba o binding ajenos. |
| Carreras con época y conexión | Nuevos casos Native actuales: cambio OFF→ON por comandos reales y nueva versión de conexión mientras apply espera el lock de tribu. Invalida proof disponible; solicitud/contacto/fechas/version permanecen idénticos, sin vínculo, auditoría de adjunción o miembro. |
| Primer contacto ausente o contacto fijo | Application nativa acepta primer contacto o upgrade del mismo declarado, y rechaza distinto/stale. SMS/WhatsApp agregan el primer teléfono a la misma pending y rechazan otro número después. |
| Plazo original y recuperación | Fechas originales de pending comparadas directamente en application, operación con COMMIT perdido, teléfono y ambas carreras. Replay conserva el resultado histórico sin otra escritura, solicitud o membresía. Reenvío del issuer conserva proof ya aplicada y pending; la emisión inicial seleccionada de T095 comprueba esa conservación nativa. |

Todas las ejecuciones citadas tienen resultado terminal y su alcance se distingue de los casos filtrados. El cierre de T096 acredita pruebas de persistencia/carreras; UI, entrega externa, eliminación de tribu, retención y gates conservan sus tareas. El inventario pasa a 114 completadas y 98 pendientes de 212.
