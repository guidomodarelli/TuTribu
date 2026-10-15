# Base de decisiones por lote: avance parcial

T176 y T183 siguen abiertas con su alcance y dependencias originales. El inventario conserva **174 tareas completas y 38 pendientes de 212**. Esta base privada todavía no está compuesta en una ruta HTTP ni en la bandeja; no acredita los seis criterios de US8 ni una función disponible para usuarios.

El [manifiesto sanitizado](batch-decisions-results.json) registra el checkpoint parcial: **159 casos aprobados en diez archivos completos**, incluyendo 138 locales y 21 Native. Mantiene separados **nueve fallos de tres archivos anteriores y quince casos filtrados**; no los cuenta como aprobados ni declara verde la batería Native completa.

## Comportamiento implementado en la base

El caso de uso deriva la cuenta, sesión y rol actuales. El writer recibe IDs y versiones explícitos, una confirmación y mensajes interno/externo separados. El ledger protege el intent normalizado, ordena los recursos y confirma una sola transacción DB-only. No recorre decisiones individuales con commits separados ni usa un proveedor.

Cada solicitud conserva su lock y reloj actual para la propuesta. La política, el rol y los hechos comunes de cuentas y pertenencias se leen una vez bajo sus locks dentro del callback de negocio, después de resolver cualquier replay. Los casos de evidencia base/local, lista y nominativa mantienen su lector real de evidencia. El owner de pertenencia agrupa sus lecturas de contexto con dependencias explícitas entre locks y toma el reloj al final.

Una denegación de negocio revierte la fila mediante savepoint; una excepción inesperada revierte el lote completo. Los hechos de avisos y auditoría de filas válidas se preparan en memoria y se materializan juntos antes de finalizar el mismo ledger. No sobreviven fuera de esa transacción. Un commit perdido se consulta antes de volver a escribir.

El snapshot mínimo conserva referencias, versiones confirmadas y códigos cerrados. La proyección pública comprueba la operación y la selección exactas, restaura el orden solicitado y calcula los contadores. Todos los conflictos confirmados producen `all_rejected` terminal. Un `started` genuino conserva sólo unidades sin resolución. No se exponen motivos internos, contactos ni errores privados.

## Diagnóstico y validación en curso

- La primera prueba con PostgreSQL creó y presentó tres solicitudes reales y falló porque no existía `decideBatch`: un caso fallido, sin omisiones.
- La primera base ejecutó cinco casos completos: **cuatro aprobados y uno fallido**. Pasaron resultados mixtos, rollback ante una falla SQL posterior, recuperación del commit perdido y original terminal con todos los conflictos. El caso de cincuenta solicitudes alcanzó el control final después de vencer la lease de noventa segundos y se revirtió; no se presenta como aprobado.
- La prueba adicional de autoridad falló al preparar un guardián después del cutover, antes de invocar el lote. El fixture ahora prepara ese actor antes de activar el control, conservando los guards reales. Su repetición completa pasó: no miembro y sesión vencida quedan fuera antes del claim, la revisión propia se deniega por fila y perder el rol impide recuperar el original.
- Nueve casos de aplicación y las regresiones locales suman **138 aprobados**, también después de la optimización; las repeticiones no se suman. La corrección del narrowing conserva los mismos oráculos. Lint focal y tipos de producto y pruebas están aprobados.
- El focal optimizado de cincuenta filas terminó **1 aprobado y 4 fuera del filtro**, con fuentes estables. Confirmó cincuenta decisiones, cincuenta efectos de pertenencia y cincuenta obligaciones, una solicitud no seleccionada intacta y replay idéntico. El escenario completo, incluida su preparación, pasó en 149414 ms frente a los 279570 ms del fallo anterior; no es una medición de latencia de producto ni un p95. El plazo del ledger y los límites de producto conservan sus valores originales.
- La revisión consultiva de código terminó sin hallazgos accionables, con dieciocho fuentes modificadas, cuatro documentos normativos, trece fuentes de contexto y trece receipts estables. No es aprobación para guardar ni para cerrar tareas.
- La batería Native ampliada terminó con **21 aprobados, nueve fallidos y quince filtrados**, con fuentes estables. Pasaron completos los dos archivos nuevos de lote/autoridad, los trece casos del writer de pertenencia y los dos archivos de rollback de nominativas. Fallaron siete casos seleccionados de atomicidad individual y los archivos de reingreso según política actual y rollback del ciclo de vida. Los quince casos restantes de atomicidad individual no se ejecutaron.
- Un checkout aislado del commit anterior `390f45e6`, con producto intacto y lockfile congelado, reprodujo el fallo de reingreso. Sólo se añadió instrumentación de lectura, sin cambiar el fixture ni sus expectativas. Un `pg.Client` sobre su rama propia confirmó ausencia de `messaging_key_material_context_is_current`, `assert_authorized_messaging_key_material_proof` y del helper actual de obligaciones. El `SELECT` mínimo de la primera función devolvió **SQLSTATE 42883**. La reparación de esos fixtures anteriores y la repetición de sus contratos siguen pendientes; este diagnóstico no acredita los nueve casos fallidos como resueltos.
- La documentación pasó cuatro vistas reales Chromium/WebKit a 390/1280, con enlaces de la sección disponibles y sin desbordes. Se inspeccionaron las capturas de escritorio Chromium y móvil WebKit. La revisión final de este checkpoint parcial conserva su paso independiente antes de guardar.

## Alcance original conservado

| Criterio de US8 | Cobertura y trabajo que sigue pendiente |
|---|---|
| AC-01: bandeja y avisos sin correo externo | La decisión conserva obligaciones internas atómicas; la integración del lote en la bandeja y el recorrido completo mantienen su validación. |
| AC-02: resumen según preferencias, sin duplicar por retry | Preferencias, agrupación y entrega externa mantienen T177 y T180–T185; la base no los implementa. |
| AC-03: fallo del proveedor no revierte el hecho | El lote no llama a un proveedor y exige obligaciones junto al commit. El ensayo de entrega fallida, reinicio y reintentos acotados sigue pendiente. |
| AC-04: selección explícita de hasta cincuenta y resultado por fila | Pasaron completos los cinco casos del lote, incluido el máximo de cincuenta. Faltan reparar/revalidar los fixtures anteriores y completar variantes de excepción/nominativa/lista, composición, API, selección visible y confirmación de UI. |
| AC-05: enlace de lectura y permisos actuales | El caso de uso usa autoridad nativa y el writer la vuelve a comprobar, incluido replay. Las nuevas rutas de lote/recuperación y su flujo autenticado mantienen su integración y prueba. |
| AC-06: automático en actividad, sin falsa revisión | El owner automático existente conserva su flujo. Los defaults y pruebas de avisos externos de US8 mantienen su trabajo original. |

El namespace `decide_admission_requests_batch` requiere su registro autorizado en recuperación HTTP, schemas propios y las proyecciones/mediciones correspondientes antes de exponerlo. La lectura de bandeja, filtros y paginación mantienen T182; correo, recordatorios, mantenimiento y actualización contextual conservan T184–T191. No se marcan tareas por existir tipos, métodos o tests aislados.

## Evidencia separada

El cierre de seguridad T175 está guardado en `390f45e694566ddcdab5d4eec69b08e4b691d8fd`. Su [CI completo](https://github.com/guidomodarelli/TuTribu/actions/runs/38722223042) pasó con 5253 casos aprobados y 774 omitidos, más build real. Ese resultado no se atribuye a esta base posterior todavía sin commit. El [registro de calidad](quality-gate.md) mantiene T211 y los gates operativos abiertos.

Las pruebas SQL usan ramas efímeras propias, artefactos reales, cuentas sintéticas y puertos concretos. Los casos nuevos de lote ejercen el journal completo; los fixtures antiguos con listas parciales conservan la reparación descrita. No modifican producción ni el piloto original, no sustituyen sus claves y no realizan envíos externos. La conciliación del `2026-10-15T12:05:22.549Z` confirmó las dos ramas protegidas y ninguna temporal. El próximo incremento continuará los fixtures y el alcance restante de US8; guardar esta base no cierra tareas ni habilita su interfaz.
