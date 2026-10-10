# Ledger de operaciones: claim, resultado y recuperación

**Feature**: `001-academy-admissions`. **Base**: `747a1754be7dd7e3150987ed4d152631d5290721`. T007/T039 permanecen abiertos hasta completar sus dependencias y consumidores. T016 se completó con la ampliación de contratos/storage/namespace sobre `c448f2d6`, registrada en [resource-contract-baseline.md](resource-contract-baseline.md).

## Implementado

El repositorio concreto recibe obligatoriamente executor guardado, authorizer actual transaccional del owner y keyring externo. La primera transacción confirma claim antes del trabajo. La segunda vuelve a autorizar, bloquea el ledger, verifica identidad/huella/lease y ejecuta un callback exclusivamente DB-only: su efecto y DTO público mínimo se confirman juntos. No hay RPC ni otro checkout dentro del callback.

La huella usa Web Crypto HMAC con clave operation_payload separada, keyId persistido y namespace actor/tribu/tipo/identidad. Ordena claves de objetos y conserva el array/intent normalizado del owner; incluye expectedVersion, nunca datos de sesión o correlación volátiles. El replay utiliza la clave almacenada retenida y se resuelve antes del CAS, sin afirmar que el resultado histórico sea el estado actual del recurso.

Un intent distinto con la misma identidad da idempotency_conflict antes de efectos. Claim vigente muestra started registrado; vencido requiere CAS de owner/lease/version. El clock se lee después de locks/crypto y la finalización vuelve a exigir lease vigente en SQL. Identidad y resultado completado quedan protegidos por la migración 1010 y su reflejo Drizzle.

La lectura propia de reconciliación devuelve ausencia/progreso/snapshot sin crear claims, extender lease o ejecutar negocio. Si se pierde la respuesta del claim, una consulta autorizada acredita su presencia antes de publicar progreso o permitir trabajo. Si se pierde respuesta después del commit de negocio, la misma identidad recupera su resultado confirmado sin repetir. Errores inesperados conservan causa privada; sólo una operación registrada aporta progreso. El use case deriva actor desde auth y proyecta fallos tipados.

El schema de replay es un contrato propio explícito del owner. No se aplica schema a filas PostgreSQL ni proveedores. Un callback con datos fuera de ese DTO, como una URL de creación, revierte efecto y finalización y conserva únicamente el claim previo. El productor de nominativas aún debe separar su URL inicial del metadata recuperable.

## Evidencia y límites

La base inicial pasó cuatro casos SQL en 55,74 segundos: replay antes de CAS obsoleto, expectedVersion/intent cambiado, rollback por DTO no público y liderazgo perdido. La guarda ausente se reprodujo con UPDATE de identidad que resolvía en vez de devolver 23514. Seis casos ampliados pasaron en 87,05 segundos, incluyendo inmutabilidad y dos claims concurrentes con un único efecto. La suite posterior pasó nueve casos, sin skips, en 151,97 segundos; agrega lectura sin claim, pérdida de respuesta de ambas transacciones y recuperación de lease. El reporte JSON confirma nueve passed y cero failed/pending.

Cuatro casos de application pasaron con puertos propios, comprobando actor del servidor, sesión ausente, progreso realmente registrado y excepción sin operación inventada. La regresión conjunta de application, contratos de versión y HTTP pasó 82 pruebas en tres suites. Lint y ambos typechecks pasaron. El build normal Next, con config original y env sintético de proceso/loopback inaccesible, compiló en 16,1 segundos y terminó tipos y las 40 páginas estáticas.

La revisión reprodujo un P2 temporal: el permiso podía vencer durante locks/HMAC, aunque las filas siguieran bloqueadas. El repositorio revalida el authorizer después de esas esperas y antes de replay, trabajo y finalización. Los cuatro escenarios de claim/inicio/finalización/replay pasaron con clock_timestamp real en 61,06 segundos; el baseline había confirmado negocio o replay obsoletos. Un cleanup de esa reproducción falló con HTTP401; se validó el perfil DEFAULT mediante CLI nativo y se eliminó únicamente su rama propia, revalidando id, nombre impredecible, parent, default=false y fecha exacta. La ausencia se comprobó después.

La suite SQL completa posterior a la corrección pasó trece casos, sin skips, en 210,53 segundos. El reporte JSON confirma trece passed y cero failed/pending; una lectura final del CLI acredita cero ramas propias restantes. La revisión nativa final cerró sin hallazgos accionables, con diez hashes estables y todos sus comandos finalizados.

Las pruebas SQL usan PostgreSQL/Web Crypto reales en ramas Neon propias, fixtures sintéticos y cleanup. No se activaron rutas, mutaciones de usuarios reales, URLs/tokens nominativos, mensajes, hosting/keyrings o gates. La evidencia de batch se amplía abajo; importación operable y autorización concreta de cada historia conservan sus tareas. Las 212 tareas, IDs, spec.md, technical-contract.md y checklists permanecen íntegros.

## Ampliación T039 sobre dc9479db

Se reprodujo una sesión vencida que todavía llegaba al runner. La aplicación ahora exige vigencia después de leer auth, mediante la política pura del owner. Los cinco casos locales pasan, con identidad derivada del servidor y progreso sólo realmente registrado.

runBatch/readBatch utilizan el mismo claim/huella/commit del ledger. El lote tiene entre uno y cincuenta IDs explícitos únicos, expectedVersion e intent por fila, contexto normalizado y orden ASCII estable. La misma canonicalización se usa al recuperar, sin otro claim. El owner ejecuta su callback DB-only/lock/CAS en ese orden; conflictos esperados son outcomes, throws inesperados revierten toda la transacción. No se agregó un sistema de jobs.

Los dos primeros SQL de lote pasaron en 67,31 s: cincuenta filas (49 cambios + 1 conflicto CAS), replay sin cambios, expectedVersion distinto con misma identidad rechazado, rollback tras falla en segunda fila y selecciones vacías/sobredimensionadas/duplicadas sin claim. La regresión previa de ledger/application pasó dieciocho casos en 300,58 s. La regresión final con readBatch explícito y la política nueva de sesión pasó dieciséis SQL y cinco de aplicación, veintiuno en total sin skips/fallos, en 366,32 s. Todas las ramas propias se eliminaron con verificación.

Lint, ambos typechecks, build normal de cuarenta páginas y cuatro renders Chromium/WebKit a 390/1280 están verdes. La revisión de cinco archivos no encontró hallazgos y conservó hashes estables. T021/T007/T016 están satisfechas; T039 queda completada como ledger y capacidad de lotes. La semántica específica de cada acción, creación de nominativas, endpoints y UI conservan sus historias y gates.
