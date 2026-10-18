# Carga en Node junto a la base

T200/T209 permanecen abiertas. La consulta mínima cercana es rápida, pero el workload real todavía supera el objetivo de tres segundos. No se usa una sonda `SELECT 1` para certificar admisiones.

El [registro saneado de las ejecuciones](colocated-node-workload.json) conserva cada resultado fallido, su bundle y sus mediciones, con los cambios del worktree identificados.

## Host y contrato de ensayo

Se verificó la disponibilidad de Neon Functions en `aws-us-east-1`. La sonda de sólo lectura, autenticada por una capacidad aleatoria cuyo hash es el único valor desplegado, respondió desde Node 24.16.0: veinte consultas, mediana 1,11 ms y p95 1,62 ms. Se eliminaron su función y rama. Ese resultado no ejecutó casos de uso de admisión.

El ensayo completo despliega el código de aplicación real para el runtime servidor y comparte fixture, seeding y medidor con la prueba local y CI. El servidor crea las claves sintéticas en su memoria; no recibe claves, actores, sesiones o roles en el body. Los únicos parámetros de despliegue son metadata pública, expiración y hash de la capacidad. La identidad de rama procede de `NEON_BRANCH` y se comprueba antes del primer acceso a base.

El journal de `tests/support/sql/20261018053000_create_admission_node_probe.sql` se aplica sólo a la rama propia, separado de las migraciones productivas. Registra operación fija, estado y medición agregada; una nueva llamada conserva el original y no ejecuta otra carga. El handler exige autenticación antes de invocar sus adapters y sólo expone `/run` y `/status`. El caso nativo comprueba denegación anónima, cien efectos reales y replay sin otra solicitud.

El bundle usa Node 24 y la resolución de servidor de Next para el marcador `server-only`; no se sustituye ningún SDK o regla de negocio. Se registran SHA base y SHA256 del bundle desplegado. El primer build fallido por resolución del marcador se conserva en `.git/admission-node-host-first-build-vitest.json`; no se cuenta como ejecución válida del workload.

## Resultados completos conservados

| Ensayo | Configuración de endpoint | Resultado | p95 de cien originales | Consulta mínima p95 | Event loop p95 |
| --- | --- | --- | ---: | ---: | ---: |
| Primer workload cercano | Perfil predeterminado | 50 admitidos / 50 pendientes, 0 fallos | 9.432,66 ms | 4,60 ms | 100,40 ms |
| Contexto agrupado | 2 CU fijas verificadas por API | 50 admitidos / 50 pendientes, 0 fallos | 8.035,15 ms | 2,63 ms | 100,93 ms |
| Diagnóstico en puertos propios | 2 CU fijas verificadas por API | 50 admitidos / 50 pendientes, 0 fallos | 7.669,96 ms | 3,42 ms | 100,93 ms |

Cada ensayo conservó máximo de pool cien, pico de cien operaciones, 500 adquisiciones y 500 liberaciones, cero esperas y cero conexiones retenidas. SQL confirmó diez mil entradas, cien solicitudes, cincuenta miembros básicos y cero entregas. El segundo ensayo separó preparación de 2.449,01 ms y warm-up de 2.958,90 ms. Ambos casos fallan por la aserción p95<3.000 ms después de verificar los efectos y el original. La versión del host es 24.16.0; las herramientas locales y CI siguen fijadas en 24.21.0.

Registros privados: `.git/admission-node-host-native-after2-vitest.json`, `.git/admission-node-host-measurement-after2.json`, `.git/admission-node-host-native-after3-vitest.json` y `.git/admission-node-host-measurement-after3.json`. La preparación y operación de recursos usan el owner de ramas efímeras; no se muta default ni se hace un envío real.

## Contexto y diagnóstico

El cliente real de base se compone desde un pool explícito y conserva el mismo `runWithGuardedTransaction`. Sus tres settings locales independientes se preparan en una sola sentencia antes del callback, y el harness usa el mismo inicializador después de seleccionar un rol. Las pruebas nativas previas y posteriores verificaron userid/correo/webhook, reset tras commit y rollback, y ejecución sin bypass RLS; los guards de tiempo y liberación no se alteran.

La medición posterior incorpora únicamente observación en los puertos propios de transacción, CPU y event loop; no reemplaza métodos de `pg`, auth ni proveedor. Registra por separado cuentas/comandos y las cohortes admitted/pending. El diagnóstico y el ensayo de mil contactos SC-021 conservan su alcance independiente. Una distribución correcta sin latencia aprobada mantiene el gate pendiente.

En el tercer ensayo, los 7.678,80 ms de ventana incluyeron 1.767,80 ms de CPU user y 399,25 ms system. El event loop registró 1.952,99 ms activos y 5.725,82 ms idle, con utilización 0,254. Se observaron 300 transacciones de cuenta y 200 de comandos; sus p95 fueron 499,37 y 5.194,92 ms. Las cohortes admitted/pending tuvieron p95 de 7.669,70 y 7.670,16 ms. Estos datos no acreditan una cuota de CPU específica del proveedor ni una causa única; mantienen pendiente el diagnóstico de las esperas y trabajo de cada fase. Registro privado: `.git/admission-node-host-measurement-after4.json` y `.git/admission-node-host-native-after4-vitest.json`.

La carga local extraída al medidor común también conservó 50 admitted/50 pending, cero fallos, cien solicitudes y cincuenta miembros básicos. Su p95 fue 18.791,85 ms y la sonda mínima 168,85 ms; conserva su fallo de latencia y su abandono aprobado. El cambio de fixture sólo separa migración y seeding; los mismos seeders crean cuentas, vínculos, política y lista en ambos hosts. El build real de Next y los tipos/lint aprobaron el contexto agrupado. Las pruebas SQL de contexto pasaron antes y después, incluida la variante sin bypass.
