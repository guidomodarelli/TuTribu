# Validación del control de calidad

Registro parcial de T211, que sigue abierta junto a sus dependencias y gates operativos. Tras el cierre de T175 se conservan las 212 tareas: **174 completadas y 38 pendientes**. Este registro distingue las comprobaciones locales y Native del control completo confirmado de `390f45e6` y de los cambios posteriores todavía en desarrollo.

## Base de fixtures ya corregida

El [CI de bff9679a](https://github.com/guidomodarelli/TuTribu/actions/runs/38705046158) falló veintiocho casos de dos suites de suscripciones. La reproducción local completa dio 117 casos: 89 aprobados y 28 fallidos. El [CI de 6959af36](https://github.com/guidomodarelli/TuTribu/actions/runs/38707814976) registró además una comprobación temporal de mensajería: 29 fallos en tres archivos.

Los dobles del puerto propio no contemplaban el lock de cuenta añadido en `ec7f9bd7` ni todas las variantes del lock ordenado de tribu. Consumían respuestas de negocio en operaciones sin resultado público. El fixture compartido ahora trata esos locks como tales, precios lo reutiliza y se retiraron las respuestas vacías reservadas para el lock antiguo. La transición a `pending` parte de `active`, conservando el caso independiente de duplicación y todas las expectativas de negocio.

La adaptación intermedia 112/12 queda como diagnóstico. La ejecución final completa terminó **124 aprobados, cero fallos y cero casos pendientes**: 57 de suscripciones de miembros, sesenta de precios y siete de ingreso libre, sin filtros. Son contratos del repositorio con puertos propios DB/proveedor; RLS, SQL y locking real mantienen sus suites Native independientes.

Los nueve casos de observación también pasan. El caso tardío usa timers estándar controlados para comprobar espera antes del límite, salida al alcanzarlo, una única escritura original retenida y limpieza. Se restauran los timers en `finally`; no cambia el worker.

## Último CI completado y sincronización de foco

El [CI de 9abf8c1e](https://github.com/guidomodarelli/TuTribu/actions/runs/38712274266) terminó con **5252 aprobados, un fallo y 774 omitidos**: los 29 fallos anteriores ya no aparecen. El fallo restante está en `academy-personal-invitation.test.tsx`, al exigir foco inmediatamente después de encontrar el error en el DOM. Ese workflow se detuvo en tests y no alcanzó el build.

El componente real asigna foco mediante un efecto de React dependiente del error. La prueba conserva el mismo elemento objetivo y ahora espera su foco con `waitFor`; mantiene el mensaje, la recuperación de la confirmación, ausencia de POST y limpieza del error al confirmar de nuevo. La suite original pasó veinte casos localmente; no se declara reproducción local del fallo de CI. La suite corregida completa vuelve a terminar **20/0**, con controles y contextos reales, sin mocks de bibliotecas internas ni cambios de producto.

## Compatibilidad del caso Native del reporter

Al activar su bandera específica, el caso de logger final falló antes de iniciar Next: `.git` es un archivo en un worktree y la captura esperaba una carpeta. Se cambió sólo el recurso de captura a un archivo temporal propio creado en modo exclusivo, con eliminación en `finally`. La ejecución completa posterior pasó con Next compilado, PostgreSQL y SDK reales, usando transporte cerrado y una causa SQL con canarios privados.

La evidencia completa de T175 y el focal de cupo reducido están en [security-and-retention.md](security-and-retention.md) y su manifiesto sanitizado. Los casos de suscripciones e invitación se registran aparte de ese inventario. Esos ajustes de cierre de T175 se limitaron a pruebas, fixtures y registros; conservaron SQL versionado, permisos, límites, errores públicos y código de producto. La base de lotes posterior tiene su propio alcance y evidencia.

## Controles actuales y trabajo pendiente

El [CI completo de 390f45e6](https://github.com/guidomodarelli/TuTribu/actions/runs/38722223042) terminó aprobado el `2026-10-15T10:54:32Z`: **509 archivos aprobados y 264 omitidos; 5253 casos aprobados y 774 omitidos**. El mismo job completó lint, tipos de producto, tipos de pruebas y build real de Next. La compilación terminó correctamente y se generaron las 53 páginas estáticas. Ese resultado corresponde a `390f45e694566ddcdab5d4eec69b08e4b691d8fd`.

Este resultado acredita el cierre guardado de T175, incluidos los ajustes del reporter y del foco. El checkpoint posterior de lotes quedó guardado y subido en `a79c74ed0a3e565c716ab2374ebddfcb1f9b80e6`. Su [CI propio](https://github.com/guidomodarelli/TuTribu/actions/runs/38733364189) terminó aprobado con **510 archivos y 5262 casos aprobados; 266 archivos y 780 casos omitidos**, además de lint, tipos de producto, tipos de pruebas y build real de las 53 páginas. Los omitidos mantienen su evidencia Native independiente; el control no se atribuye a ediciones posteriores de fixtures ni cierra T211.

El checkpoint parcial de lotes tiene 138 locales y 21 Native aprobados, con sus seis casos nuevos de lote/autoridad completos. La batería ampliada terminó además con nueve fallos de fixtures anteriores y quince casos filtrados. El checkout intacto de `390f45e6` reprodujo uno; PostgreSQL confirmó funciones actuales ausentes en su esquema parcial y SQLSTATE 42883. Los fixtures corregidos preparan el journal completo e inscriben sus claves sintéticas originales. La repetición completa del ciclo de vida pasó cinco casos en tres archivos; el focal histórico pasó uno, con veintiuno fuera de su filtro. La primera repetición intermedia de ciclo de vida dio tres aprobados y dos fallidos, registrados por separado. La revisión consultiva actual terminó sin hallazgos accionables.

La batería individual terminó aprobada con fuentes actuales en dos cohortes disjuntas: **11/0 y 11/0**, cada una con once casos fuera de su filtro. La unión verifica exactamente los **22 casos originales**, sin faltantes ni duplicados, según el inventario obtenido por colección real. Junto a los cinco casos de ciclo de vida, son **27 aprobados únicos**; el focal histórico no se suma otra vez. La conciliación confirma los nueve fallos originales y los quince antes filtrados ahora aprobados. El intento amplio intermedio terminó 22/0 con inputs modificados durante su ejecución; permanece sólo como diagnóstico, fuera de esa cuenta actual.

Todos esos procesos terminaron. La conciliación de Neon del `2026-10-15T13:08:54.152Z` confirmó producción y el piloto original, con cero ramas temporales. El alcance y la evidencia están en [batch-decisions-baseline.md](batch-decisions-baseline.md) y [batch-fixture-repair-results.json](batch-fixture-repair-results.json). La reparación acredita esos contratos nombrados; el resto de US8 y T211 permanecen abiertos. El control del commit que la guarde corresponde a su propio workflow y no se anticipa aquí.

La reparación quedó guardada y subida en `521aaf7d4da42e25db270dc9601c43d06cf6c769`. Su [CI completo](https://github.com/guidomodarelli/TuTribu/actions/runs/38741795440) terminó aprobado: **510 archivos y 5262 casos aprobados, 266 archivos y 780 casos omitidos**, lint, tipos de producto/pruebas y build real de las 53 páginas. Este resultado corresponde a ese checkpoint y conserva separados los Native omitidos.

El modelo privado de preferencias posterior tiene su [evidencia propia](admission-notification-preference-model.md): **19 casos locales aprobados**, fuentes estables, lint y tipos correctos, más cuatro vistas de documentación en Chromium/WebKit. Define defaults y propuestas de cambio con versión; persistencia, grupos, API, UI y despacho conservan sus tareas. No se atribuye a ese código posterior el CI de `521aaf7d` ni se cierra T180 o T211.

- Lint focal de los archivos corregidos: aprobado, sin diagnósticos.
- `pnpm run typecheck:tests`: aprobado después de los últimos ajustes.
- `git diff --check`: aprobado.
- Suites completas afectadas: 124 casos de repositorios, nueve de observación y veinte de invitación, sin fallos ni exclusiones; las repeticiones no se suman.
- Build aislado real de T175: código cero y 1727 archivos de producto equivalentes, con sólo CRLF/LF como diferencia de bytes. Es evidencia separada del CI anterior detenido en tests.
- Control completo del cierre de T175 en `390f45e6`, del checkpoint privado de lotes en `a79c74ed` y de la reparación en `521aaf7d`: aprobados por sus respectivos workflows. El modelo privado de preferencias posterior conserva su validación y su workflow propio al guardarse.

La fuente ejecutable es `.github/workflows/quality-gate.yml`: instala el lockfile congelado y ejecuta `pnpm run ci`, que encadena lint, tipos de producto, tipos de pruebas, tests y build. Se usan comprobaciones locales relevantes y ese workflow para el control completo. Un resultado verde no certifica las suites Native omitidas por flags ni los ensayos operativos ausentes.

El cierre final de T211 deberá comprobar el commit vigente, sus dependencias, regresiones y build exigidos. El cierre de T175 no sustituye esa validación ni la de OG-01 a OG-06.
