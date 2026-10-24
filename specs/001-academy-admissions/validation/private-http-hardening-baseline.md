# Bordes privados, autenticación y diagnósticos

T172 completada sobre el checkpoint de código `5e123daa358b55c37690fcbe7d0a55bed6f01a03`, después de la revisión final y sus ejecuciones terminales. Se conserva íntegro su criterio original: origen/CSRF, caché/referrer, proyecciones públicas y causas/loggers equivalentes, autoridad de contexto/recurso antes de claves y validación de inputs/DTOs propios sin revalidar SDK/PostgreSQL. Sólo T172 cambia de estado: 168 tareas completadas y 44 pendientes de 212.

## Correcciones conectadas

- La creación de intención de confirmación rechaza el origen ajeno antes de leer el body o abrir el módulo. Los schemas estrictos y la autorización actuales siguen siendo necesarios.
- El logger configurado de Better Auth selecciona códigos fijos y correlación opaca por operación asíncrona; nunca inspecciona los argumentos privados. Se conserva su umbral nativo de advertencia. La recuperación SSR deja de registrar la excepción original y mantiene sus condiciones y límite de retry.
- El decorador del adapter real protege también las causas que llegan al logger global del SDK. Sólo envuelve `DrizzleQueryError` y `pg.DatabaseError`; conserva la causa original privada y ofrece representaciones seguras para texto, consola y JSON. Reenvía CRUD, consumo, esquema opcional y transacción local, con argumentos, resultados, metadata y modo transaccional nativos. No transforma errores de negocio ni redirects del callback.
- El wrapper HTTP de auth selecciona DTOs propios de sesión actual, listado y acceso exitoso con token. Conserva cookies, renovación, errores y redirecciones. Una proyección inutilizable responde 500 seguro, no una sesión anónima. La API privada conserva su resultado nativo; el cliente publicado sigue consumiendo la sesión minimizada.
- La configuración nativa bloquea `/get-access-token` y `/refresh-token` por HTTP antes de efectos, conservando `auth.api.getAccessToken` para el servidor. El acceso Google con ID token omite el token de sesión en su respuesta, sin impedir la cookie ni el flujo OAuth normal.
- La política del logger de Next en desarrollo excluye rutas privadas, queries y escapes, además del feed personal existente. Las rutas ordinarias sin query siguen registrándose. No atribuye garantías sobre los logs externos del hosting.

No se usa `customSession`: la versión instalada captura errores de lectura y devuelve null, lo que convertiría un fallo real en un resultado anónimo. Tampoco se sustituye el SDK ni el logger global con monkeypatches de producción.

## Evidencia nueva y límites

| Ejecución | Resultado terminal | Alcance |
|---|---|---|
| Contratos y recuperación locales | 154 aprobados, cero fallos y filtros | SDK real en memoria, JWT/JWKS firmados, cliente nativo, logger instalado de Next, schemas propios y puertos propios donde corresponde. Incluye origen antes de body/módulo, severidad y aislamiento concurrente, DTOs/cookies/errores, endpoints bloqueados con API privada operativa y OAuth normal. |
| SDK, Drizzle y PostgreSQL | Dos aprobados, cero fallos y filtros | Rol real no bypass con SQL42501 y causa/token retenidos sólo en memoria; logger configurado y singleton sin fuga; HTTP compuesto conserva 500. CRUD, commit/rollback, consumo único, metadata original, errores API/redirect por identidad y SQL23505 dentro de una transacción, con conexión utilizable después del rollback. |
| Next compilado y PostgreSQL | Un aprobado, cero fallos y filtros | Entry point y opciones reales: cookie firmada, sesión actual/listado minimizados, sesión anónima null, ambos endpoints de tokens 404, headers privados/correlación y creación de intención de origen ajeno 403 para JSON/texto antes de interpretar un comando. |
| Build aislado | Código cero | Next16.3.4 real, dependencias propias y entorno sintético; el servidor HTTP usa ese build. Las fuentes de producto se comparan con sus hashes, sin reutilizar el `.next` del usuario. |

Los reportes privados conservan los resultados fallidos previos y no vuelven a contar los mismos casos: el primer ensayo de permisos usó un rol que aún podía leer, el test inicial de cookie ignoraba el tiempo transcurrido del SDK, un oráculo confundía el resultado nativo de updateMany con un número y otro usaba un nombre incorrecto de columna. Se corrigieron los ensayos desde el comportamiento/documentación reales. El primer build detectó que una junction salía de la raíz de Turbopack; la repetición instaló dependencias propias. Los defectos reproducidos de privacidad y origen conservan sus reportes rojos separados.

## Cobertura original y evidencia reutilizada

| Criterio | Fuentes y alcance conservados |
|---|---|
| FR-043–045 y D-20 | Máscara/metadata autorizadas, cifrado y SecretStore actuales; loggers y proyecciones equivalentes corregidos. La causa real queda disponible sólo al backend. |
| Origen/CSRF, no-store/referrer y TC-013 | Boundaries de admisión/mensajería, CSV, intención sensible y auth nativo. Los rechazos preceden a la ejecución; errores y redirects conservan headers privados. |
| FR-064 y US-11-AC-03 | Schemas propios estrictos y owners actuales de envío: no aceptan destino, remitente, plantilla o texto arbitrarios. Una candidata autorizada no concede permiso para enviar. |
| FR-120/130, SC-004/008 | [T165](admission-security-and-privacy.md) aporta API/UI reales, aislamiento de cuentas/tribus/roles, solicitantes sin membresía y proyecciones no enumerables. Los cambios de auditoría posteriores y este diff conservan esa autorización. SecretStore revalida el recurso/contexto y el liderazgo antes de importar claves y después de esperas. |
| US-11-AC-01/02 | [T164](messaging-usage-and-abuse.md) conserva los contadores compartidos y el cupo revalidado antes del marcador, incluso al cambiar conexión/canal/dispositivo/tribu. Sus 78 casos HTTP, 16 del SDK y reporter Native son evidencia reutilizada por ese alcance, no casos nuevos de T172. |
| US-11-AC-04 y superficies equivalentes | Errores, props, reportes/capturas y CSV de T164/T165 se complementan con las nuevas salidas nativas de auth/SDK/Next. La auditoría examinó list-accounts, account-info y update-session: el primero elimina tokens, el segundo comprueba ownership y el último no tiene campos adicionales configurados para devolver una sesión modificada. No se imponen restricciones sobre opciones futuras inexistentes. |
| Input/DTO propio y payload upstream | Una validación de input por boundary y schema sólo de la proyección propia seleccionada. No se incorporan schemas para filas PostgreSQL ni respuestas del SDK. |

## Cierre y pendientes

La revisión final Codex no encontró hallazgos accionables y confirmó suficiencia para el criterio original íntegro de T172. Conservó 47/47 hashes al inicio y al final, manifiesto SHA256 `568841f093743129f240f94f597aaf6bab1fd5d5e7128c0db1599b2d17483240`. Los tipos de producto y tests, lint y commitlint pasaron. La documentación tuvo veinte vistas y recorridos en Chromium/WebKit a 390/1280, 708 comprobaciones de enlaces y cero errores o desbordes. El manual y el menú conservan sus paths originales y registran el código `5e123daa358b55c37690fcbe7d0a55bed6f01a03`; el validador del manual informa cero errores y sólo las dos advertencias conocidas de documento local sin URL compartida ni catálogo de traducciones. El código ya está publicado en la rama de trabajo. T167/T169/T170/T173, ejecución programada, rollout y gates externos conservan su alcance original.

No hubo envíos externos, gasto, regeneración de protecciones del piloto ni cambios de hosting. Las ramas propias de los ensayos se eliminan después de sus terminales; producción y el piloto guardado permanecen protegidos. Arquitectura: [sesión](../../../docs/architecture/member-sessions.htm#private-auth-http), [mensajería](../../../docs/architecture/tenant-messaging.htm#messaging-private-http) y [admisión](../../../docs/architecture/academy-admissions.htm#admission-private-http).
