# Auditoría del criterio completo de T128

Alcance backend literal sobre `96750d56`, con dependencias T127 y T123 cerradas. La revisión de sólo lectura acredita todas las cláusulas sin brechas obligatorias; no sustituye T124/T129–T132 ni entrega externa, legacy, retención o gates.

| Criterio | Recorrido y evidencia |
| --- | --- |
| Metadata privada y autoridad server | GET de historial/detalle, resolver de tribu y use cases con actor nativo; el HTTP real cierra acceso después de perder liderazgo. |
| Create inicial, rename y revoke | POST/PATCH/revoke reales con Better Auth, recencia y PostgreSQL; creación, cambio de nombre, reemplazo y revocación verifican estados y versiones persistidos. |
| Preview nominativo seguro | GET overview mediante el use case read-only; anónimo/cuenta correcta/reenviado/token inválido, ausencia de contacto, nombre privado y token en preview y cero escrituras. |
| Audiencia y minimización | El líder recibe metadata autorizada; el solicitante obtiene preview genérico. DTOs propios estrictos excluyen token hash, material de emisión, cuerpos SDK, secretos y linaje privado. |
| Token sólo en emisión inicial | La URL se construye con origen configurado, se entrega una vez y no se reconstruye en replay, historial, detalle u operación. |
| Versión positiva y conflicto sin efectos | Schemas propios validan expectedVersion; SQL/use cases conservan CAS e intent. HTTP verifica stale 409, cambio de intent 409 y reemplazo observado. |
| Resultado histórico frente al actual | La consulta original conserva versión uno después de rename; detalle vigente muestra versión dos sin recuperar URL. |
| Boundary y recuperación | Inputs se validan antes de composición, DTOs públicos se guardan, responses son no-store/no-referrer y errores no exponen payloads internos. |

`personal-invitation-management-http-flow.test.ts` y `personal-invitation-preview-http-flow.test.ts` tienen dos casos reales verdes, sin skips (`.git/codex-personal-http-audience-audit.json`), con cierre de Next, pools y ramas propias. Los handlers, schemas y contratos se ejercen también en la corrida actual `.git/codex-t128-local-http-contracts.json`: 82 verdes, de los cuales uno corresponde al aislamiento de identidad del checkpoint; el Native de identidad omitido en esa corrida local tiene su ejecución real separada verde. No se cuenta un skip como integración.

La revisión final conserva 15/15 hashes de fuentes estables, agregado `E8F5328B5C7FC56D19518BFC85E1FD772E37A29AF0D0BBC4E285962FBC05CD6A`. El avance de HEAD durante la revisión corresponde únicamente al checkpoint independiente de identidad `96750d56`, cuyo SQL de revocación, build y disponibilidad WebKit pasaron. No cambia el criterio backend de esta tarea ni acredita la matriz administrativa aún activa.

T128 se marca por este contraste completo de comportamiento alcanzable y evidencia terminal; el conteo pasa a 128 completadas y 84 pendientes, manteniendo los 212 IDs y sus requisitos originales.
