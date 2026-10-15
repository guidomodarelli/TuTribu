# Validación del control de calidad

Registro parcial de T211, que sigue abierta junto a sus dependencias y gates operativos. Tras el cierre de T175 se conservan las 212 tareas: **174 completadas y 38 pendientes**. Este registro distingue las comprobaciones locales y Native del control completo del siguiente commit.

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

La evidencia completa de T175 y el focal de cupo reducido están en [security-and-retention.md](security-and-retention.md) y su manifiesto sanitizado. Los casos de suscripciones e invitación se registran aparte de ese inventario. Los cambios actuales siguen limitados a pruebas, fixtures y registros; permanecen intactos SQL versionado, permisos, límites, errores públicos y código de producto.

## Controles actuales y trabajo pendiente

- Lint focal de los archivos corregidos: aprobado, sin diagnósticos.
- `pnpm run typecheck:tests`: aprobado después de los últimos ajustes.
- `git diff --check`: aprobado.
- Suites completas afectadas: 124 casos de repositorios, nueve de observación y veinte de invitación, sin fallos ni exclusiones; las repeticiones no se suman.
- Build aislado real de T175: código cero y 1727 archivos de producto equivalentes, con sólo CRLF/LF como diferencia de bytes. Es evidencia separada del CI anterior detenido en tests.
- Control completo del nuevo commit: pendiente de su push y del terminal de GitHub Actions; todavía no se declara aprobado.

La fuente ejecutable es `.github/workflows/quality-gate.yml`: instala el lockfile congelado y ejecuta `pnpm run ci`, que encadena lint, tipos de producto, tipos de pruebas, tests y build. Se usan comprobaciones locales relevantes y ese workflow para el control completo. Un resultado verde no certifica las suites Native omitidas por flags ni los ensayos operativos ausentes.

El cierre final de T211 deberá comprobar el commit vigente, sus dependencias, regresiones y build exigidos. El cierre de T175 no sustituye esa validación ni la de OG-01 a OG-06.
