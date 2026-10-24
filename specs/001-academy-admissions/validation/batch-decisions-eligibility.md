# Variantes de elegibilidad en decisiones por lote

Estado: **avance parcial de T176/T183** sobre `edbb2cf4`. No cambia el producto ni se cierran tareas, historias o gates. Se conservan **175 completas, 37 pendientes y 212 totales**, y las 71 temáticas aprobadas mantienen su estado.

La [API y recuperación originales](batch-decisions-http.md) y el [núcleo transaccional](batch-decisions-baseline.md) conservan su evidencia independiente. Este incremento agrega pruebas del caso de uso real con PostgreSQL, cuentas y sesiones nativas, capturas sintéticas y comandos existentes. No usa mocks de plataforma, inserciones ficticias de invitaciones canjeadas ni transporte de mensajería.

## Casos y resultados

| Caso | Comportamiento comprobado | Estado |
| --- | --- | --- |
| Motivos y excepción declarada | Aprobar o rechazar sin motivo deja una denegación terminal sin decisiones ni membresía. La aprobación explícita con motivo conserva por separado la respuesta externa y no inventa entrada de lista, vinculación ni evidencia confiable. | Aprobado en la primera cohorte. |
| Lista actual y excepciones retiradas | Dos pendientes reciben entradas independientes después de presentar su solicitud. Tras retirar una entrada y apagar excepciones, el lote aprueba sólo la habilitada; conserva la otra y la fila no seleccionada, sin editar las entradas. | Aprobado en la primera cohorte. |
| Nominativas y autorización actual | Invitaciones creadas y canjeadas normalmente: lista requerida habilitada, lista requerida retirada, dispensa de lista, autorización retirada y captura invalidada. El retiro de autorización cancela previamente su solicitud según FR-092; el lote conserva esa cancelación y resuelve por fila los otros casos. | Aprobado en la repetición focal corregida. |

El fixture `tests/support/admission-batch-eligibility-fixture.ts` reutiliza la composición de admisión y los owners reales de lista e invitaciones. El material inicial de invitación queda dentro del helper; el test conserva únicamente identidades y versiones. `tests/unit/modules/academy-admissions/infrastructure/admission-batch-eligibility.test.ts` comprueba resultados públicos y efectos persistidos. El límite de ejecución propio está en las constantes de soporte; no cambia tiempos ni reglas de producto.

## Procedencia de las ejecuciones

La primera ejecución del archivo completo terminó **dos aprobados, un fallido y cero omitidos**, con **2057 inputs estables**. Los dos casos aprobados son los primeros de la tabla. El tercero esperaba equivocadamente que retirar una autorización nominativa dejara la solicitud pendiente y que el total sólo incluyera dos decisiones.

La revisión independiente identificó un P2. FR-092 y el owner `cancelRevokedPersonalAdmission` ya establecen la cancelación de la pendiente en el mismo commit del retiro, con una decisión y una obligación de aviso. El historial de ese owner incluye `68532407` y `ec7f9bd7`. La corrección pertenece al test: observa la cancelación antes del lote y exige conservar su solicitud, decisión y aviso originales tras el lote y su replay. El resultado de esa versión antigua es `request_conflict`; las dos aprobaciones nuevas deben convivir con la cancelación previa, con tres decisiones y sólo dos efectos de membresía.

Sólo se modificó el tercer callback. El prefijo completo con imports, setup y los dos primeros casos es idéntico; los otros **2056 inputs** de la primera ejecución también siguen idénticos. La repetición selecciona únicamente el tercero. Los dos primeros quedan fuera de ese filtro y no se cuentan nuevamente. Los recibos conservan las identidades de los casos y esta comparación; no se presentará como un archivo completo aprobado en una sola ejecución.

La repetición focal terminó **un aprobado, cero fallos y dos casos fuera del filtro**, con **2057 inputs estables**. La conciliación por identidad, ordinal, prefijo y fuentes acredita **tres casos únicos aprobados en dos cohortes**. Conserva el fallo inicial como antecedente y no lo suma como un caso adicional ni presenta un archivo completo verde en una sola ejecución. En el caso nominativo se confirmaron dos aprobaciones, dos membresías y tres decisiones totales, incluida la cancelación anterior; el replay conserva también su decisión y aviso originales.

Recibos privados `.git/codex-t183-batch-eligibility-native-first-{target,outcome}.json`, `.git/codex-t183-batch-eligibility-cohort-plan.json`, `.git/codex-t183-batch-eligibility-native-current-{target,outcome}.json`, `.git/codex-t183-batch-eligibility-cohort-proof.json` y `.git/codex-t183-batch-eligibility-final-quality-proof.json`. Ambos productores terminaron y sus resultados fueron consumidos.

La consulta oficial posterior de Neon confirmó **cero ramas temporales propias** y conservó producción, el piloto original y la rama ajena: tres ramas presentes. El arnés retiró únicamente los recursos acreditados por sus recibos; no se borró por prefijo ni se modificaron recursos originales. La conciliación está en `.git/codex-t183-batch-eligibility-neon-final.json`. No hubo envíos externos ni migraciones productivas.

## Calidad y alcance restante

`pnpm run typecheck:tests` y el lint focal de los tres archivos de pruebas pasaron después de corregir el caso. La repetición de la revisión de código quedó sin hallazgos accionables y verificó los hashes de tres modificados, cinco normativos, quince contextos y siete recibos. El cierre conjunto de la evidencia conserva su revisión propia antes de guardar. No se cambia código de producto, estructura de base ni configuración desplegada. Los manuales y la arquitectura conservan su comportamiento documentado.

El [control completo del padre documental `edbb2cf4`](https://github.com/guidomodarelli/TuTribu/actions/runs/38854473238) aprobó **531 archivos y 5595 casos**, con **287 archivos y 824 casos omitidos**, y build de **55/55 páginas**; su watcher terminó con código cero. Ese control pertenece al padre y no valida estas pruebas posteriores. El checkpoint que las guarde requiere su propio control.

T176/T183 conservan los seis criterios integrales y sus dependencias. Preferencias, grupos, materialización y entrega de correo, fallos y reinicios, driver, actualización contextual y la selección visible de la bandeja mantienen sus tareas originales. Esta cobertura no sustituye sus ensayos ni habilita funciones nuevas en la pantalla.
