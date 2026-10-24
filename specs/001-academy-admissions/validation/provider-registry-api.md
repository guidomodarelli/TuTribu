# Registro explícito de proveedores y fronteras HTTP

Auditoría de **T193** sobre `68817d75`, con una corrección puntual del registro. El alcance es registro, descriptor, resolución actual y sus fronteras HTTP. Se cierra únicamente esa tarea: **176 completas, 36 pendientes y 212 totales**, con las 71 temáticas aprobadas intactas. El checkpoint conserva revisión conjunta y control completo propios.

## Requisitos y evidencia

| Requisito de T193 | Cadena ejecutada y resultado |
| --- | --- |
| Sólo Zavu registrado en producto | `createRegisteredMessagingAdapters` construye el registro únicamente con `createZavuProviderDescriptor`. El catálogo contiene sólo ID y canales implementados. Los descriptors sintéticos aparecen exclusivamente en pruebas, sin añadir opciones productivas. |
| Identidad desconocida sin sustitución | El registro deniega identidades no registradas, incluidas vacía y nombres de propiedades de prototype, antes de construir factories. `POST /api/tribes/[slug]/messaging/connections` ejecuta el handler real: un proveedor no implementado devuelve `409/missing_capability` antes de componer servicios o almacenar la clave. |
| Canal inexistente denegado | El registro rechaza `fax`, vacío, `null`, `false` y cero con `missing_capability`. Sólo `undefined` omite legítimamente seleccionar canal al inspeccionar una credencial. El PUT real de configuración rechaza `fax`, vacío y `EMAIL` con `400/invalid_input`, `no-store` y sin abrir servicios. |
| Campos mínimos y referencias propias | Mutar la copia de ID/canales del catálogo no cambia el registro ni habilita SMS. Los handlers ejercen schemas propios, cursor/UUID y pertenencia a la conexión pedida, y excluyen credenciales o campos ajenos. El inspector usa el SDK real; exige que el detalle corresponda al ID seleccionado y publica sólo recursos propios, sin contactos o secretos del proveedor. No impone un formato inventado a IDs opacos del proveedor. |
| Sin clave mutable global | Los casos SDK intercalan credenciales independientes con transporte propio y comprueban sus resultados y headers originales. `RegisteredMessagingInspectorFactory` resuelve proveedor antes de cada operación; el sender prepara el intento original y resuelve su canal sin otro envío ni fallback. |
| Resolución nativa actual | El Native usa PostgreSQL, almacenamiento cifrado, composición y SDK reales con HTTP controlado. Valida la credencial fuera de locks, consulta sólo el provider ID actual y deniega conexión cruzada, recovery lock y recencia revocada sin leer plaintext desde el reader. |

Las rutas productivas consumen los mismos handlers y composición: creación en `app/api/tribes/[slug]/messaging/connections/route.ts` y configuración en su segmento `[connectionId]/configuration`. Los recursos publicados conservan las comprobaciones de scope de sus propios handlers. La pantalla existente sigue ofreciendo Zavu; este trabajo no agrega un selector ni un proveedor nuevo.

## Defecto reproducido y corrección

La revisión encontró un P3 preexistente en `MessagingProviderRegistry.resolve`: la condición por truthiness confundía un canal vacío con la omisión del parámetro. El rojo real terminó **17 aprobados y cuatro fallidos en dos archivos completos**, sin omitidos. Fallaban los valores vacío, `null`, `false` y cero; los negativos de API ya se cerraban en el schema propio.

La corrección compara explícitamente `channel !== undefined`, mantiene el código seguro `missing_capability` y documenta la omisión legítima. Los casos positivos de inspección sin canal y el Native completo conservan su comportamiento. No se añadió un fallback, validación de schema de PostgreSQL/upstream, adapter ficticio de producción, cambio de API pública, nueva migración ni permiso.

El loop de revisión de código terminó sin hallazgos sobre tres modificados, cinco normativos, quince contextos y ocho recibos. La corrección no debilita assertions ni omite el caso fallido; la revisión conjunta de documentación y cierre mantiene su comprobación independiente.

## Ejecuciones actuales

| Cohorte final | Aprobados | Fallos | Omitidos | Archivos completos |
| --- | ---: | ---: | ---: | ---: |
| Local, Node `24.21.0` | 51 | 0 | 0 | 5 |
| Native de proveedor actual después de corregir | 1 | 0 | 0 | 1 |
| Casos distintos actuales | **52** | **0** | **0** | **6** |

Los locales incluyen dieciséis de registro, diecisiete del SDK inspector, diez de creación HTTP, tres de recursos HTTP y cinco de configuración HTTP. Ejercen implementaciones reales y doblan sólo puertos o transporte propios; no mockean SDK, validadores ni bibliotecas de plataforma.

La familia local final registra sus inputs y permanece estable. El Native final registra **2057 inputs estables** y termina con código cero. El Native anterior también pasó antes del fix, pero es el mismo caso repetido y no se suma como segundo. Los primeros 25 y 42 locales, incluida la repetición para fijar explícitamente Node, son subconjuntos o repeticiones; no se agregan a los 51 actuales. El rojo permanece como antecedente separado.

Tipos de producto, tipos de tests y lint de los tres TypeScript pasan después del fix. No cambia React, estilos o recorrido válido de la interfaz; no requiere nuevas capturas de manual ni una reconstrucción local completa. La arquitectura vigente ya exige cerrar identidad/canal no implementados y sigue siendo aplicable. El control completo del nuevo checkpoint deberá comprobar su build real y regresiones al subirse.

Recibos privados `.git/codex-t193-provider-current-final-{target,outcome}.json`, `.git/codex-t193-provider-current-quality-proof.json`, `.git/codex-t193-provider-native-current-{target,outcome}.json` y `.git/codex-t193-provider-empty-channel-red-diagnosis.json`. Los procesos terminaron y sus resultados fueron consumidos. La consulta oficial posterior de Neon confirmó **cero ramas temporales propias**, con producción, piloto original y rama ajena preservados, en `.git/codex-t193-provider-neon-current-final.json`; el recibo anterior al fix conserva su procedencia separada. No se borró por nombre o prefijo ni se modificaron recursos originales.

El barrido de pool, transacciones, retries y llamados desde páginas conserva el checkout compartido con liberación idempotente y guard de inactividad en pool y transacción. Esta corrección no agrega checkouts, retries ni RPC en SSR; los roots del registro usan operaciones explícitas. Se registra en `.git/codex-t193-provider-pool-sweep.json`, sin modificar paths ajenos.

## Límites preservados

El [CI exacto del padre `68817d75`](https://github.com/guidomodarelli/TuTribu/actions/runs/38856993096) aprobó **531 archivos y 5595 casos**, con **288 archivos y 827 casos omitidos**, tipos/lint y **55/55 páginas**. Su watcher terminó con código cero. Ese resultado acredita el checkpoint anterior de lotes; no se atribuye al registro corregido ni sustituye los Native omitidos por flags.

T192 mantiene la comparación completa de resultados de admisión con otro adapter propio. T194 conserva los puertos pequeños y discriminados y cualquier acoplamiento restante; T195 conserva la proyección y UI de capacidades, T196 la documentación integral de extensión y T197 la ejecución completa de US12/SC-020. Esta auditoría no declara cumplidos esos criterios por probar un catálogo privado.

T185 mantiene la preparación y entrega de avisos agrupados: la recuperación actual conoce fuentes individuales y el preparador actual conoce códigos. Deben integrar la procedencia del grupo y su intento completo sin sustituirlo por una obligación arbitraria. Los ensayos con Zavu externo, sus límites y los demás gates permanecen separados; este trabajo no envió mensajes reales ni prepara por sí solo un piloto operativo.
