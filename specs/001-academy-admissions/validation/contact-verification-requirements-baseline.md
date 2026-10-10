# Auditoría de requisitos de comprobación local

Auditoría de T095 sobre `21998c5b`, con regresiones guardadas en `c5d04c61` y `21998c5b`. La matriz conserva el alcance íntegro de sus siete AC y límites; no cierra los recorridos, historias o gates de verificación restantes.

## Nuevas regresiones comprobadas

- `admission-verification-scope-isolation.test.ts`: un caso PostgreSQL/crypto nativo verde en 117,56 s. Un código genuino se rechaza a través de otra cuenta, otra tribu y otro desafío, antes de crear operaciones o alterar contadores. Su propietario todavía puede usarlo después. Queda una prueba local, sin nueva sesión, captura global o verificación del correo global.
- `admission-verification-dispatch-pipeline.test.ts`: ampliación nativa verde en 113,61 s. Conserva el pipeline con SQL, cuenta, preparación y SDK reales, y transporte HTTP cerrado. La aceptación del proveedor deja desafío issued, cero fallos, verified_at NULL, cero proofs/membresías, emailVerified false, la sesión original y ninguna captura global. Se conserva el replay sin otro POST y el trabajo ajeno de la cola.
- Cuatro suites focales de orquestación, dominio, lista y boundary de errores: 58 casos verdes. Tipos de tests y lint verdes.
- Revisión aislada de las tres regresiones, incluida la protección de borrado indicada abajo: cero hallazgos accionables; HEAD `b79c331d`, tres hashes estables, manifiesto `048748198253BB225906B33021EE47528D3131522E21BD571247AB09136323CD`. No se ejecutaron pruebas desde el reviewer.

Los requisitos se cotejaron con la spec, los consumidores actuales y sus pruebas. Todas las corridas citadas abajo cuentan con resultado terminal; una omisión por gate o filtro no se atribuye a integración ejecutada.

## Matriz de T095

| Requisito | Evidencia observable |
| --- | --- |
| US-05-AC-01, envío explícito por conexión/canal y destinatario propios | Pipeline focal SQL/SDK real con transporte cerrado, replay sin otro POST y cola ajena preservada. `admission-phone-dispatch-baseline.md` acredita SMS/WhatsApp, remitente, plantilla, teléfono original y fallback deshabilitado; esos owners no cambian en este incremento. |
| US-05-AC-02, prueba local sin sesión ni identidad global | Nueva prueba nativa de scope confirma una proof sólo para el dueño, con una sesión original, emailVerified false y cero capturas globales. El transporte aceptado permanece sin proof. |
| US-05-AC-03, rechazo de cuenta/tribu/desafío/propósito ajenos | Nueva prueba nativa confirma tres cruces sin consumo ni operaciones nuevas. La suite de dominio ejercita además contacto/canal/propósito/época/conexión; la suite SQL de writer cubre scope y diagnóstico sin proof de admisión. |
| US-05-AC-04, cinco fallos/expiración sin reset | Seis casos nativos de `contact-verification-writer.test.ts` verdes en 214,72 s: invalidación al quinto, replay sin otro fallo, diez fallos horarios entre tribus, veinte diarios UTC, vencimiento durante la última consulta, pérdida de autoridad y propósito diagnóstico. |
| US-05-AC-05, alternativa SMS explícita y mismas cuotas | `admission-whatsapp-alternative-baseline.md` acredita espera real, mismo teléfono, invalidación del código anterior, replay y dos pedidos sobre el mismo subject; `code-request-budget.test.ts` acaba de comprobar que cambiar propósito/canal no elude la espera ni los presupuestos. La UI y gates tienen tareas propias. |
| US-05-AC-06, accepted/delivered no comprueba contacto | Pipeline SDK ampliado: accepted/consumed coexisten con challenge issued, verified_at NULL, cero proofs/miembros, sin cambio de correo global ni sesión. El caso seleccionado nativo de message-delivery-repository confirma después delivered, replay y cuota retenida, manteniendo desafío issued y cero proofs. La validación local es una operación distinta. |
| US-05-AC-07, owner único sin divulgación | Carrera nativa y aislamiento entre tribus de `allowlist-binding-concurrency-baseline.md`; regresiones de eliminación de cuenta y carreras base/local en `allowlist-account-minimization-baseline.md`. El catálogo seguro `contactBindingConflict` indica revisar cuenta o pedir ayuda, sin nombre/id del dueño. |
| Cuenta/contacto: cinco pedidos por hora, veinte por día y espera entre canales/propósitos | Cinco casos nativos de `code-request-budget.test.ts` verdes en 139,46 s, sin omisiones: replay único, límites independientes, última plaza concurrente con claves puente, día UTC y límite diagnóstico. |
| ON aun Gmail con captura base vigente | `admission-gmail-additional-verification.test.ts` verde en 145,43 s. La cuenta/sesión/binding y captura gmail se crean con el mismo correo original; el provider nativo comprueba esa clasificación. Submit sin proof rechaza, emisión/verificación locales reales permiten después la admisión con evidence_source local; entrada sigue enabled/version1 y captura global sigue siendo la única. |

La extensión de fixture agrega únicamente un correo sintético opcional al crear la identidad; no cambia valores por defecto ni reescribe una captura/sesión previa. Código de producto y políticas permanecen sin cambios. Dos casos seleccionados nativos del issuer y de la política OFF terminaron verdes en 61,52 y 29,30 s: código generado de seis dígitos, TTL original exacto de diez minutos, recuperación/validación/application reales, y OFF sin desafío, contadores, entrega u operación. Diez casos filtrados no se acreditan por ese ensayo.

La revisión de la extensión Gmail terminó sin hallazgos accionables: HEAD `c5d04c61`, dos hashes estables, manifiesto `962A229D79F7FF47187A2260972B2628D8DBF6FDE55F526AC60D66280C1A97BA`. Tipos de tests y lint finales también pasan. La rama delivered del receipt se comprobó con un caso seleccionado nativo verde en 65,61 s; siete casos filtrados no se acreditan por ese ensayo.

El cierre de T095 acredita la cobertura de pruebas de esta matriz, incluyendo casos propios de application y las integraciones del mismo flujo. No acredita entrega externa paga, UI pendiente, eliminación de tribu ni mantenimiento general. El inventario pasa a 113 tareas completadas y 99 pendientes de 212.

## Eliminación de tribu: requisito aún pendiente

El intento nativo de eliminar una tribu con admisión aprobada reprodujo `23503` en `admission_binding_tribe_fkey`. La eliminación de cuenta ya implementada no cubre este caso. La minimización de tribu debe conciliar identidad mínima, auditoría, pertenencia, parada de entregas y contadores de abuso; no basta cambiar esa FK a CASCADE.

`allowlist-binding-tribe-deletion.test.ts` pasa un caso nativo en 67,66 s y comprueba la protección actual: el rechazo revierte el borrado completo y conserva propietario/contacto/referencia, configuración de lista, miembro admitido, solicitudes, operaciones y auditoría, además de las cuentas globales independientes. Su verde acredita el rollback protector, no una eliminación implementada. T111/T171 siguen abiertas y el objetivo final conserva la eliminación con minimización explícita requerida por la spec.

Estos cambios son pruebas/evidencia, sin modificar comportamiento de producto, esquema, permisos, UI, manuales o changelog. No se repite el build de producto sin un cambio que lo justifique.
