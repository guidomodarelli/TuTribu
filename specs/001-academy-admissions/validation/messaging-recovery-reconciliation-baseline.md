# Reconciliación privada después de restaurar una copia

## Estado

T199 está completa en su alcance de copia aislada: el ensayo Native de bloqueo, reconciliación y reapertura terminó aprobado. T201 y T203 permanecen abiertas; no se acreditan recursos instalados en todos los hosts, Workers operativos ni OG-02. El inventario queda en 197 tareas completas, 15 pendientes y las 71 temáticas aprobadas.

La composición no monta endpoints, no activa drivers y no modifica configuración productiva. Los ensayos utilizan ramas Neon propias, Web Crypto y PostgreSQL reales, claves sintéticas en memoria y transporte HTTP cerrado del SDK real; no envían mensajes reales.

## Comportamiento implementado

- `buildMessagingRecoveryModule` compone el caso de uso y los owners de mensajería y admisión. La tribu, el entorno y las épocas original y nueva son inputs privados explícitos; una época no puede reemplazarse por sí misma.
- El owner requiere autorización backend actual, principal SQL sin usuario y permiso de ejecución de `claim_messaging_recovery_scope`. El namespace vivo y la tribu quedan bloqueados de forma exclusiva sin espera. Un grant ordinario de tablas no concede esa capacidad.
- La lectura externa se realiza después de la autorización y alrededor de los efectos. Exige bloqueo activo y el entorno y época nueva exactos. No reconstruye autoridad o claves desde el snapshot.
- Cierra las políticas, incluida la manual/OFF; conserva reglas, marker y época de verificación. Suspende conexiones abiertas de la época original y retira versiones y envelopes, sin revivir recursos terminales ni reemplazar sus causas.
- Libera el slot candidato después de retirar su material. Conserva referencias seleccionadas para su reemplazo explícito y no prolonga los vencimientos históricos de candidatas ni sus plazos de purga.
- Invalida pruebas disponibles y las aplicadas a solicitudes pendientes; conserva su historia, las solicitudes aprobadas y sus miembros. Invalida desafíos antiguos y cancela sólo entregas en cola sin intento, manteniendo intentos inciertos y consumo.
- Devuelve los efectos confirmados del lote y `remaining`. `inspect` es de lectura y no atribuye conteos a una respuesta perdida. No repite automáticamente, libera el bloqueo ni abre admisiones.
- La migración versionada `20261017132000_claim_messaging_recovery_scope.sql` revoca ejecución pública de la primitiva privada.

## Ensayo ampliado que permanece fallido

Fuente: worktree `messaging-restore-validation`, HEAD `7988e3a4ad2834a960a7e8539ac55783be8dd3ad` más el diff propio de reconciliación. Registro privado: `.git/messaging-recovery-native-43033f3d/`.

| Comprobación | Resultado observado |
| --- | --- |
| Caso Native completo | 0 aprobados / 1 fallido / 0 omitidos |
| Duración del caso | 1.800.010,85 ms; timeout propio de 1.800.000 ms |
| Fuentes | 3.632 inputs estables; ningún archivo cambiado, añadido o eliminado durante el ensayo |
| Herramientas | Dos helpers estables |
| Restauración y bloqueo | Se observaron las fases de copia restaurada, bloqueo externo, época externa y secreto retirado |
| Reconciliación y reemplazo | Se observaron `recovery_reconciled` y `replacement_prepared` |
| Admisión nueva | No acreditada; el caso no llegó a confirmar su fase final |

Se conservaron dos fallos: la expectativa del test manual pedía `admissions_paused`, pero el writer devolvió `admission_ineligible`; después se agotó el timeout del caso. La lógica de dominio devuelve un rechazo `closed` con política cerrada y el writer de presentación lo transforma en `admission_ineligible`. No se cambió ese comportamiento del producto para ajustar la prueba.

Antes de limpiar la copia se ejecutó una consulta directa con `pg`, en transacción de sólo lectura y con timeout de sentencia. El scope sintético manual fue único: política cerrada, verificación adicional desactivada, modo manual, academia y evaluador habilitados, marker y activación presentes, cero solicitudes y cero miembros básicos. La consulta no leyó credenciales, códigos, ciphertext ni contactos.

La limpieza retiró primero `br-cold-silence-anclxbm6` y después su padre propio `br-broad-salad-answdkea`, comprobando ID, nombre, padre, ausencia de hijos y condición no default. Ambas ausencias quedaron confirmadas. Permanecieron las tres ramas originales: producción, desarrollo y piloto anterior. No se borraron recursos por prefijo ni se repitió un DELETE incierto.

## Ajustes posteriores

1. La expectativa manual usa el código del owner y agrega un assert SQL de cero solicitudes y cero membresías; conserva el assert de política cerrada.
2. Sólo el presupuesto del caso Native aumenta a cuarenta y cinco minutos para incluir su preparación y sus fases acumuladas. No cambia ningún TTL, cuota, plazo de recencia, presupuesto de producción ni timeout global de Vitest.
3. La reapertura informa por separado desafío emitido, despacho confirmado, prueba confirmada, solicitud presentada y decisión confirmada. Cada fase se registra después de comprobar su resultado, sin material privado.
4. El test del observer utiliza un directorio temporal propio porque `.git` es un archivo en un worktree. Conserva el proceso real y todos sus canarios y asserts de redacción; el arreglo está guardado en `a1158f1c`.

La revisión posterior de los veintidós paths conserva 45/45 inputs y 22/22 fuentes estables, sin hallazgos accionables. Dictamen privado: `.git/codex-messaging-recovery-post-timeout-fixed-review.json`; SHA256 `4252be84605c8d3be83a5bbd0974071faac3ebec5d4340e889eddb0b104efad0`. Esta revisión estática no convierte el Native anterior en aprobado.

La regresión general del cohort corregido pasó con `pnpm run ci`: lint sin errores ni advertencias, tipos de producto y tests, 5.948 casos aprobados y 884 omitidos, y build real de Next. Los 3.632 inputs conservaron sus hashes durante la ejecución; registro privado `.git/messaging-recovery-quality-0d038267/`. Los omitidos incluyen ensayos Native opt-in y no se cuentan como aprobados.

La copia al checkout principal conserva exactamente los hashes de los veintiún paths de código, migración y tests revisados; el observer ya estaba guardado en `a1158f1c`. Este último commit tiene CI completo aprobado en el run `39039826032`. La integración no incorpora cambios ajenos ni convierte el Native fallido en aprobado.

## Repetición Native aprobada y cierre de T199

La ejecución independiente `.git/messaging-recovery-native-ea857be3/` terminó con código 0: un caso aprobado, cero fallidos y cero omitidos, en 1.805.411,438 ms. Conservó los 3.632 inputs y los dos helpers sin cambios. Los veintidós paths de fuente, integración y cohorte ejecutado coinciden byte por byte; el código y sus pruebas están guardados en `acf8240361b41768fea3d2e55b2fbe1212b51dc6`, con el observer ya corregido en `a1158f1c`.

El caso confirmó la copia restaurada bajo recovery lock, época externa y retirada del secreto; reconciliación por lotes con lectura después de perder una respuesta; rechazo de un principal ordinario; política manual/OFF cerrada; retiro y purga contra las fechas originales; conservación de historia, membresías e intentos inciertos. Después confirmó por separado reemplazo preparado, desafío nuevo, despacho al transporte cerrado, prueba nueva, presentación y decisión. La admisión básica nueva y la integridad del padre quedaron comprobadas al final. Ningún mensaje real fue enviado.

El inventario posterior confirmó ausentes `br-wandering-butterfly-an7jsmnl` y su padre propio `br-aged-smoke-an0c98ql`, con las tres ramas originales preservadas. Las ramas distintas que otros ensayos propios tenían activas no se atribuyen a esta limpieza. Recibo privado: `.git/codex-messaging-recovery-native-final-proof.json`.

La revisión post-Native concluyó sin hallazgos y verificó el criterio completo de T199. Dictamen privado `.git/codex-messaging-recovery-post-native-closure-review.json`; SHA256 `5994804bb2319d9b2a8a749ae7d605f7f28a39f78bcf326dd5a5f592fe36e3b8`. El ensayo anterior de treinta minutos permanece fallido. Sólo se cierra T199: esta evidencia usa Node, Web Crypto, PostgreSQL y el SDK real con HTTP cerrado. El protocolo operativo, el hosting original, ambos targets y la entrega externa conservan T201/T203 y sus gates.

## Documentación propietaria

- Arquitectura: [custodia y recuperación](../../../docs/architecture/tenant-messaging.htm#private-recovery-owner).
- Manual interno: [recuperación de una copia](../../../user-guides/internal-operations.html#messaging-restore-reconciliation).
- Evidencia negativa anterior aprobada: [bloqueo después de restaurar](messaging-restore-safety-baseline.md).
- Gates: [registro operativo](operational-gates.md).
