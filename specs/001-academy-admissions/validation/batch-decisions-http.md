# API de decisiones por lote y recuperación original

Avance parcial de T176/T183 guardado y subido en `33bc645fee9dd6a8f432d669b23788f75e3ca4e8`, sobre `6b6a54e401e4352845d69c2d7a59255f915df300`. Conserva **175 tareas completas y 37 pendientes de 212**. Instala composición y POST del lote y registra su namespace en el GET de operaciones originales. La selección múltiple, su confirmación en la bandeja y la integración completa de avisos mantienen sus tareas; este incremento no acredita los seis AC de US8 ni cierra T176, T183, T189 o T211.

## Recorrido implementado

`createManualRequestModule` compone `DecideAdmissionRequestsBatchUseCase` sobre el mismo writer DB-only de la decisión individual. `app/api/tribes/[slug]/admissions/request-decisions/route.ts` aporta únicamente el wiring de framework. No agrega proveedores, keys mutables globales ni escrituras dentro del reader.

`createAdmissionBatchDecisionHandler` reutiliza el schema real existente de selección explícita. Valida origen, path, query vacía y body antes de abrir módulos; conserva IDs únicos, versiones y confirmación, separa ambos mensajes y rechaza autoridad, remitente o campos adicionales del navegador. Mapea `requestId` a `admissionRequestId` una vez al entrar a aplicación. La cuenta y sesión proceden del resolver nativo y el writer mantiene sus locks y autorización propios.

El POST vincula el resultado a la operación y selección exactas. Devuelve 200 para un original terminal, incluidos `mixed` y `all_rejected`; sólo un original realmente registrado y sin filas confirmadas puede producir 202. Rechaza filas ajenas, repetidas o de la decisión contraria, cancelaciones y supuestos éxitos dentro de un lote todavía sin confirmar. No serializa notas, contacto, identidad o diagnóstico privado. Las respuestas usan no-store.

El GET existente de operaciones reconoce `decide_admission_requests_batch`. Reutiliza la primitiva SQL protegida, que ya selecciona por actor, tribu, sesión y operación. Se amplían la allowlist del adapter y los dos contratos propios de recuperación, y se exige también para este namespace un líder o guardián activo actual. El snapshot original contiene sólo `results` con IDs, versiones o códigos cerrados; el GET no reconstruye contadores ni el estado actual de las solicitudes. Consultar conserva la lease y no repite decisiones. No cambia SQL, permisos ni estructura y no requiere una migración nueva.

## Pruebas y cohortes

| Cohorte | Resultado real y uso |
| --- | --- |
| Handler ausente | Un archivo no pudo cargar; cero casos ejecutados. No se cuenta como un caso aprobado o como una prueba funcional fallida. |
| Primera familia POST | 48 aprobados en tres archivos completos, cero omisiones. Precede a la integración de recuperación. |
| Recuperación aún no registrada | 36 aprobados y cuatro fallidos, dos archivos completos. Fallaban started/completed en aplicación y GET. |
| PostgreSQL antes del registro | Cero aprobados y un fallido en un archivo completo, fuentes estables. El writer había confirmado su original, pero el reader devolvía null por excluir el namespace. No hubo un error de PostgreSQL ni se cambió su función para corregirlo. |
| PostgreSQL tras el registro | Un aprobado, cero fallos u omisiones, bajo runtime y NOBYPASS. Precede a la opción de hosting sintético del fixture; se conserva separadamente y el mismo caso se repite en la cohorte final. |
| Local final | **88 aprobados, cinco archivos completos, cero fallos u omisiones**, después de la opción de fixture y con inputs estables. |
| Native final | **Dos aprobados, dos archivos completos, cero fallos u omisiones**, con servidor Next y PostgreSQL reales y **2065 inputs estables**. Repite el caso SQL y agrega el POST/GET real; no se suma el aprobado anterior como un tercer caso. |

La familia local final tiene 27 casos del POST, seis del GET original, doce de rutas de revisión preservadas, nueve del caso de uso de lotes y 34 de recuperación de aplicación. Usa validadores, proyección y resolución reales; sólo dobla puertos propios. El ajuste de tipos inicial amplió correctamente el tipo del ID externo del fixture: `randomUUID` tenía un tipo template literal más estrecho que su representación en mayúsculas. No se cambió el contrato de producción para resolverlo.

El caso SQL final usa ambos ejecutores, conserva el ledger y las entregas al leer, rechaza otro actor/tribu, operación ausente, rol retirado y sesión vencida, y comprueba que el rol sin bypass no puede leer directamente la tabla privada.

El caso HTTP final usa cookies firmadas de cuentas sintéticas y la factory real. Un guardián confirma un resultado mixto, repite la misma intención y recupera su snapshot sin otra decisión o lease. Un líder confirma cincuenta versiones; el POST rechaza cincuenta y una, falta de confirmación y autoridad del navegador. El GET no permite recuperar ese original desde otra tribu existente; POST y GET rechazan rol retirado y sesión vencida. Los efectos finales son **dos operaciones de lote, 51 decisiones, cero membresías, dos solicitudes pendientes intactas y cero entregas**. No hubo envíos externos.

Recibos `.git/codex-t183-batch-http-recovery-final-{target,outcome}.json`, `.git/codex-t183-batch-recovery-native-red-diagnosis.json` y `.git/codex-t183-batch-native-current-{target,outcome}.json`. El artifact HTTP sólo conserva etapas y contadores; no contiene cookies, tokens ni keyrings. Las claves sintéticas del proceso se comparten en memoria con el fixture y no se guardan en el repositorio.

## Build, calidad y limpieza

Tipos de producto y tests y lint focal de catorce archivos aprobaron. El build aislado real terminó con **1801 archivos de producto equivalentes**, **2062 del overlay** y **55/55 páginas**, con inputs estables. Después se añadió únicamente soporte de pruebas y los dos Native al checkout propio: el productor final comprueba que todos los 1801 archivos del producto siguen siendo exactamente los construidos. No se recompila o modifica el cache del servidor durante esos Native.

La arquitectura pasó cuatro vistas y 28 regiones, Chromium/WebKit a 390/1280, sin desbordes ni errores y con hash estable. El primer helper seleccionaba el ID del heading como si fuera un contenedor; se corrigió sólo el selector para usar la sección `aria-labelledby`, sin cambiar el documento para obtener el resultado.

La primera conciliación de ramas se tomó mientras el productor final seguía vivo y registró una rama propia activa; no se eliminó ni se interpretó como una fuga. Tras consumir el resultado final dos/cero, la consulta oficial confirmó **cero ramas temporales propias**, conservando producción, piloto original y la rama ajena. No se aplicaron migraciones productivas ni se modificó el piloto.

El [CI del padre documental `6b6a54e4`](https://github.com/guidomodarelli/TuTribu/actions/runs/38849827253) pasó 530 archivos y 5563 casos, con 285 archivos y 822 casos omitidos y 55 páginas. Pertenece al padre. El [CI propio de `33bc645f`](https://github.com/guidomodarelli/TuTribu/actions/runs/38852713182) terminó correctamente para ese head exacto: **531 archivos y 5595 casos aprobados**, **287 archivos y 824 casos omitidos**, tipos/lint y build de **55/55 páginas**. Las omisiones no se cuentan como Native ejecutados. La revisión del checkpoint terminó sin hallazgos sobre 21 modificados, nueve normativos, quince contextos y catorce recibos. Las ediciones posteriores del manual y sus fuentes locales conservan su revisión y validación propias.

## Alcance que continúa pendiente

Los [casos originales del núcleo](batch-decisions-baseline.md) mantienen su procedencia. El [ensayo posterior de elegibilidad](batch-decisions-eligibility.md) registra las variantes de excepción, restricciones nominativas y lista obligatoria con sus cohortes y corrección de FR-092; su estado de ejecución se informa allí. Los demás criterios integrales y dependencias de T176/T183 siguen pendientes. Preferencias, grupos, outbox, fallos de correo, driver y actualización contextual conservan T177–T181 y T184–T191. El [manual de operaciones internas](batch-decisions-manual.md) quedó guardado en `edbb2cf4`, con traza al código `33bc645f`, fuentes locales y sin atribuir selección múltiple a la pantalla. Su [workflow propio](https://github.com/guidomodarelli/TuTribu/actions/runs/38854473238) aprobó 531 archivos y 5595 casos, con 287 archivos y 824 casos omitidos y 55 páginas; no valida los tests agregados después.
