# Validación del control de calidad

Registro parcial sobre `6959af3650b3a6bc9efbf840429124daf2e15610`, antes del siguiente push. T211 sigue abierta, junto a sus dependencias y los gates operativos. Se conservan las 212 tareas, con 173 completadas y 39 pendientes; este registro no acredita una entrega completa.

## Fallos observados y alcance del arreglo

El [CI de bff9679a](https://github.com/guidomodarelli/TuTribu/actions/runs/38705046158) falló en veintiocho casos de dos suites de repositorios de suscripciones. La reproducción local completa conservó ese resultado: 117 casos, 89 aprobados y 28 fallidos. El [CI de 6959af36](https://github.com/guidomodarelli/TuTribu/actions/runs/38707814976) registró además un caso intermitente de observación de mensajería: 29 fallos en tres archivos.

Los fixtures de los repositorios no contemplaban el lock de cuenta añadido en `ec7f9bd7`, ni todas las variantes del lock ordenado de tribu. Sus respuestas en cola se consumían en una operación que no devuelve datos de negocio. El fixture compartido ahora trata esos locks como operaciones sin resultado público; precios lo reutiliza y se retiran las respuestas vacías que los casos reservaban para el lock antiguo. El caso que procesa un cambio a `pending` parte de un estado almacenado `active`, de modo que ejerce una transición real; el caso independiente de duplicación conserva su propósito. Las expectativas de resultado, checkout, conciliación y llamadas al proveedor permanecen intactas.

La primera adaptación de esos fixtures terminó con 112 aprobados y doce fallos en tres archivos: se conserva como diagnóstico y no como validación aprobada. Tras ajustar la preparación completa, las tres suites terminan con **124 aprobados, cero fallos y cero casos pendientes**: 57 de suscripciones de miembros, sesenta de precios y siete de ingreso libre. No hay filtros de nombres. Son pruebas del contrato del repositorio mediante puertos propios de base de datos y proveedor; no prueban RLS, SQL, locking real ni acceso externo a Mercado Pago. Esos efectos conservan sus suites Native y evidencias independientes.

La prueba intermitente de mensajería esperaba que un timer del host coincidiera exactamente con el reloj usado para medir cuarenta milisegundos. En el CI el resultado conservó un envío aceptado, cero mensajes sin resolver y observación no disponible, pero no alcanzó el umbral exacto de `deadlineReached`. Los nueve casos originales pasan localmente, por lo que el fallo no se presenta como una reproducción local determinista. El caso corregido usa timers estándar controlados para comprobar espera antes del límite, salida al alcanzarlo, una única escritura tardía retenida y limpieza de timers; los nueve casos completos pasan. El reloj real se restaura en `finally`.

Los cambios se limitan a cuatro archivos de pruebas y fixtures, más estos registros de validación. No se cambian SQL versionado, permisos, errores públicos, límites ni código de producto. No se agregan mocks de ORM, framework, SDK o bibliotecas internas; el control del reloj sólo aísla timers en el caso temporal.

## Validación y trabajo pendiente

- Lint de los cuatro archivos afectados: aprobado, sin diagnósticos.
- `pnpm run typecheck:tests`: aprobado después de los ajustes finales.
- `git diff --check`: aprobado.
- Suites locales completas afectadas: 124 casos de repositorios y nueve de observación, sin fallos ni exclusiones; no se suman repeticiones.
- Control completo del nuevo commit: pendiente del siguiente push y del terminal de GitHub Actions. Todavía no se declara aprobado.

La fuente ejecutable del control completo es `.github/workflows/quality-gate.yml`: instala el lockfile congelado y ejecuta `pnpm run ci`, que encadena lint, tipos de producto, tipos de pruebas, tests y build. Se usa ese workflow para el control completo y se ejecutan localmente las comprobaciones relevantes al cambio. Un resultado verde del workflow no certifica las suites Native omitidas por flags ni los ensayos operativos ausentes.

La validación de seguridad mantiene su evidencia en [security-and-retention.md](security-and-retention.md). Los 124 casos de suscripciones e ingreso libre se registran por separado de ese inventario. La revisión final de T211 deberá comprobar el commit vigente, sus dependencias, las regresiones y el build exigidos; no puede cerrarse con este checkpoint parcial.
