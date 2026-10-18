# Claves y restauración en los hosts

**Estado: T201, T203 y OG-02 pendientes.** El cierre anterior de T199 acredita PostgreSQL/Web Crypto y el SDK real con transporte cerrado en Node. No acredita instalación de secretos, control externo operativo ni la restauración en ambos hosts. La [reconciliación previa](messaging-recovery-reconciliation-baseline.md) conserva su protocolo, resultados y límites.

## Contrato que debe probarse

En una copia sintética propia deben comprobarse Node y Workers reales con el mismo código de seguridad. El entorno, época, recovery lock y los seis keyrings permanecen fuera de PostgreSQL. El host debe leerlos antes de seleccionar/abrir material y volver a comprobarlos en los límites existentes de decrypt, dispatch y activación. La configuración desconocida mantiene el cierre actual.

Antes de restaurar se cierran todos los drivers y se confirma el bloqueo externo en ambos hosts. Sólo se restaura la hija exacta del padre sintético, conservando el checkpoint. Después se reconcilian época, inventario y retiradas externas; se suspenden versiones anteriores y se invalidan las pruebas/outbox según sus reglas existentes. Se conservan las claves históricas todavía necesarias para vínculos e intents y nunca se reutiliza un keyId con material distinto.

El ensayo debe demostrar rechazo de secretos y envelopes retirados, cero dispatch y admisión protegida cerrada ante filas restauradas. La reapertura requiere conexión nueva, diagnóstico/prueba vigente y confirmación actual de política; un tombstone restaurado o ausencia de trabajo pendiente no desbloquean el host. Los intentos inciertos y resultados originales conservan su identidad. No se ejecuta SQL, restore ni rotación contra producción o el piloto protegido.

Los recursos y capacidades del ensayo deben tener identidad única, duración acotada y limpieza confirmada por metadata independiente. No se conservan claves, tokens, URI, credenciales, nonces de OAuth ni payloads en los artefactos de validación. Una prueba de importación o un worker de muestra no sustituye el recorrido completo de restauración y reapertura.

La [sonda de configuración Node](admission-node-environment-preflight.md) posterior acreditó únicamente que un valor de prueba no secreto llega al entorno de una función autenticada propia mediante la ruta oficial, sin argumentos con ese valor ni `env pull`. No instaló keyrings ni ensayó restore. No reemplaza las obligaciones de T201/T203 o el ensayo del segundo target y mantiene OG-02 pendiente.

La [carga canónica posterior](admission-distributed-performance.md#ejecución-completa-del-comando-versionado), sobre `09bf76b8`, instaló después la configuración sintética externa original en cuatro funciones Node reales. Cada función importó los seis keyrings y la misma época fuera de PostgreSQL; la cohorte confirmó los HMAC necesarios para cien admisiones concurrentes. El escaneo del despliegue no encontró material privado persistido y sus recursos se retiraron. Esto acredita esa precondición de configuración de Node; no prueba el uso criptográfico completo de los seis propósitos, el bloqueo/retiro/restore/reapertura ni Workers. El arnés SQL existente de restauración conserva sus resultados y debe llevarse al recorrido de ambos hosts sin reducir sus condiciones. T201/T203 y OG-02 siguen pendientes.

## Separación de la composición del ensayo

Los owners reales de identidad, credenciales, activación, política, preflight, verificación y solicitud se componen ahora desde `tests/support/messaging-restore-composition.ts`. Su entrada es una capacidad de transacciones guardadas, la sesión original y la lectura de configuración externa. No reciben facultades de migración, creación de ramas o conexión del padre. Los wrappers del ensayo anterior conservan sus firmas y delegan a esa composición; no se crea otro algoritmo de recuperación ni un sustituto de los adaptadores de producto.

La preparación acepta además la configuración sintética original generada fuera de SQL y la conserva desde la creación hasta la activación. El caso completo existente se actualiza para usar el lector real de la configuración de hosting y comprobar esa identidad antes del checkpoint. Tipos y lint aprobaron esta preparación; la repetición Native debe conservar el bloqueo, la retirada, la restauración real, la reconciliación y la admisión nueva ya exigidos. La extracción por sí sola no acredita instalación en un host, Workers u OG-02.

La repetición posterior sobre `e908ccf9` aprobó el caso completo, sin fallos ni omisiones, en **1.696.999 ms**. El [recibo saneado](messaging-restore-host-preparation-native.json) conserva la identidad de la configuración externa original y las comprobaciones de retiro, restore real, bloqueo, cambio de época, ausencia de la clave retirada, reconciliación por lotes, purga histórica, política manual cerrada y reapertura con conexión, diagnóstico, prueba y admisión nuevas. Los intentos inciertos y el padre conservaron sus resultados originales. El SDK usó transporte HTTP cerrado; no hubo mensajes reales.

La auditoría posterior comparó 3.226 archivos y no encontró cambios durante el ensayo. La consulta independiente confirmó ausencia del padre y la copia propios, con las cuatro ramas persistentes conservadas. La página de convenciones modificada pasó las cuatro vistas Chromium/WebKit a 390/1280 y sus seis destinos locales, con hashes estables. Esta regresión valida la preparación compartida en Node local y PostgreSQL reales; la restauración y los controles externos instalados en los hosts Node y Workers siguen pendientes. T201/T203 y OG-02 no cambian de estado.

## Preflight de acceso

La comprobación actual encontró Wrangler 4.128.0 instalado y `whoami --json` devolvió `loggedIn: false`. Chrome tiene el acceso de Cloudflare preparado; el ingreso muestra aceptación de términos y la nueva conexión requiere aprobación puntual de acceso persistente. La petición al usuario sigue pendiente. Los intentos OAuth no completados finalizaron sin acreditar una sesión, y no se crearon Workers, secretos ni bases para este ensayo.

Se preparó un conjunto reducido de scopes: lectura de cuenta y perfil y administración de scripts de Workers. Wrangler agrega `offline_access` a su propio flujo; esta persistencia forma parte de la aprobación solicitada. Se descartó antes de autorizar el scope más amplio `workers:write`, que incluye zonas, KV y rutas ajenos a este objetivo. La aprobación no se interpreta como prueba de secretos instalados ni habilitación de producción.

Los recibos privados de descubrimiento están en `.git/admission-recovery-cloudflare-access.json` y `-access-diagnostic.json`; sólo contienen booleans, nombres de campos y estado de proceso. La verificación posterior debe comprobar sesión, cuenta de TuTribu y capacidad efectiva antes de crear recursos; no basta con un clic de autorización o un archivo de configuración.
