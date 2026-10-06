# Lectura privada de credenciales y ciclo de material

**Feature**: `001-academy-admissions`. **Base**: `60986ca569fafe8b03f7d02bd33321ffb6b1b7e6`. T034/T035 y las dependencias/gates conservan su estado pendiente.

## Alcance

`PostgresEncryptedSecretStore` separa composición humana y worker mediante un propósito fijo. El principal humano procede del provider actual de auth y debe coincidir con cuenta/sesión/sujeto; el Store vuelve a leer bajo locks binding y recencia exactos, líder activo canónico y recurso propio vigente. El worker acredita intento in_flight, marker, reserva consumida, lease/version y contexto exactos sin usar una sesión humana ni reautorizar un despacho ya iniciado con una cuota distinta.

Las versiones seleccionadas/candidatas y sus secretos deben ser los actuales. La candidata inactiva pierde acceso a los siete días; una versión activa sin cambios no requiere repetir un diagnóstico diariamente. El envelope se lee sólo después de la autorización. El lector externo aporta keyrings/entorno/época/recovery actuales antes y después de descifrar; el reloj PostgreSQL se consulta después de las esperas y crypto. No hay SDK/RPC dentro de la transacción ni plaintext, IV, ciphertext o keyrings en JSON/logs del adapter.

La migración 1000 retira material de forma irreversible y fija un plazo de purga que no se puede ampliar más allá de veinticuatro horas. La FK de versión impide borrar la fila referenciada: se purgan sus bytes IV/ciphertext y se conserva metadata mínima con purged_at. La primitiva privada procesa un lote bounded con SKIP LOCKED y devuelve sólo el contador; un replay no restaura ni vuelve a purgar bytes. El mantenimiento operativo aún no está conectado.

Re-encriptar material vivo utiliza una primitiva backend privada con CAS sobre keyId anterior y scope completo. El backend prepara el nuevo envelope del mismo BYOK mediante Web Crypto; SQL no recibe el plaintext ni las claves. La referencia y ambas versiones quedan intactas. Retiro/purga no se pueden eludir con esa transición ni con un update directo. PUBLIC no recibe EXECUTE; la transición estructural no constituye por sí sola un productor operativo de rotación.

## Evidencia

Pasaron primero tres casos SQL y luego seis ampliados. La versión con lectura, RLS, AAD, retiro, postvalidación de clave y purga pasó nueve casos en 200,09 segundos. La regresión de rotación pasó de forma focal en 22,48 segundos; la ejecución completa final pasó los diez casos, sin skips, en 222,87 segundos y dejó un reporte JSON propio. Cada caso usa una rama Neon propia, fixtures sintéticos y cleanup verificado; los keyrings se generan sólo en memoria. Tras la interrupción se observaron los procesos antes de continuar; una observación incompleta generó una segunda corrida, cuyos diez resultados completos y cierre se verificaron sin iniciar otras ejecuciones.

Se reprodujeron UPDATE de retiro reversible, FK 23503 al borrar el envelope referenciado y 42883 de la purga ausente. La revisión encontró que la primera guarda bloqueaba rotación de cipher key; la corrección agrega CAS privado. Se reprodujo además que un GUC ausente producía NULL y permitía el update directo; la condición se cierra explícitamente con coalesce(...,false). Crypto real confirma el mismo BYOK bajo la clave nueva sin cambiar referencia o versiones.

Pasaron 82 pruebas en dos suites de HTTP/use cases y criptografía real, incluyendo fallos tipados posteriores al preflight. Lint y ambos typechecks pasaron. El build normal Next, con configuración original y environment sintético de proceso/loopback inaccesible, compiló en 17,4 segundos y terminó tipos y las 40 páginas estáticas; el fix posterior cambia sólo SQL y su regresión.

La revisión nativa finalizó con cero hallazgos accionables, once hashes estables y todos sus comandos cerrados después del fix de rotación. La lectura oficial de metadata Neon no encontró ramas codex-academy-admissions-* restantes. La evidencia no se extiende a los gates operativos pendientes.

Se revisó el uso de pools: la única adquisición directa de la aplicación es el guard compartido, que libera ante error de cliente/rollback y fija idle timeout. El Store usa ese guard; la lectura nativa de auth no renueva sesión ni activa el hook de refresh y su retry rechaza adquisición saturada. Las otras composiciones usan el mismo helper, y el pool que Better Auth administra internamente mantiene su guard onConnect. No se introduce un pool, retry, HTTP o reconciliación en render nuevo.

## Límites

No se guardaron credenciales Zavu reales ni se configuró hosting/keyrings, epoch, cron o proveedor externo. No se activa envío, rePOST, lectura pública de secreto, recuperación por backup ni una garantía de purga operativa. Las pruebas Node/Workers, restore, productor de rotación, mantenimiento de candidatas/OTP y el driver siguen pendientes con OG-02/OG-05/OG-06. Las 212 tareas, spec.md, technical-contract.md, identificadores y checklists permanecen íntegros.
