# Recuperación del cambio original de correo

Incremento parcial de T184 posterior a `267e3adba0b29bf13e63d54f649b732c0b0e25b5`. Se conserva el inventario original de 212 tareas: 174 terminadas y 38 pendientes. No agrega pantalla, productor de grupos, outbox, dispatcher ni envíos externos.

## Contrato y responsabilidad

`GET /api/tribes/<slug>/admissions/operations/<operationId>` reconoce ahora `update_admission_email_settings` mediante el lector común original. La función SQL existente ya selecciona ese namespace bajo cuenta, tribu, sesión y membresía bloqueadas; no se modifica SQL ni se crea otro ledger. El adapter amplía su allowlist y exige liderazgo activo mediante la autorización canónica de lectura de política.

La lectura no exige otra confirmación de Google, keyrings o proveedor y no toma ni renueva una lease. Comprueba la sesión actual antes y después de la consulta y conserva el cierre ante pérdida de rol. La existencia del original nunca concede permiso actual. El POST de un cambio nuevo mantiene su confirmación reciente específica, MAC, UUID, intención exacta y versión observada.

El DTO persistido es un contrato propio de la aplicación, no una respuesta upstream. La aplicación comprueba su tribu antes de publicar sólo `enabled`, `version` y `timeZone`. Un resultado histórico de versión uno permanece separado de la configuración actual de versión dos. Un rechazo conserva su motivo propio y un original started sigue pendiente. Ausencia, ámbito ajeno o contrato inutilizable no fabrican una operación.

La proyección mínima común pertenece a `notifications/application/results`; el mapper HTTP la reutiliza. Los schemas estáticos comunes pertenecen a `academy-admissions/constants/admission-operation-recovery-schemas.ts`, con una fachada de imports compatible en `application/results`. No se aplican schemas a filas PostgreSQL ni respuestas de proveedores. No cambian los writers ni sus controles de mutación.

## Validación local y PostgreSQL

El rojo local ejecutó cinco casos: dos pasaron y tres rechazaron el namespace todavía desconocido. Después pasaron **54 casos en tres archivos completos**, sin filtros ni omisiones: cinco nuevos de recuperación, 31 regresiones del lector original y 18 del HTTP de ajustes. El primer reporte local conserva su resultado íntegro; no se le atribuye retroactivamente un registro previo de inputs.

El primer intento Native falló en sus dos casos porque el CLI de Neon agotó el plazo de quince segundos al consultar el proyecto, antes de crear ramas o entrar en PostgreSQL. Se conservó ese resultado fallido, se comprobó el acceso readonly y se repitió el archivo completo en serie, sin cambiar producto, harness ni assertions para conseguir el verde.

La repetición aprobó **dos casos completos**, sin filtros ni omisiones, con **1999 inputs registrados previamente y estables**. Ejercita el journal real, originales de versiones uno y dos, recencia invalidada, runtime de recuperación bloqueado y el DTO mínimo histórico; comprueba que un cambio nuevo exige recencia y que un líder silenciado pierde lectura. El segundo caso provoca un fallo real después del claim de la operación y observa su estado started durable; la consulta conserva exactamente versión, lease owner y vencimiento originales, sin inicializar ajustes.

El build aislado real terminó con código cero, 53 páginas y **1750 archivos de producto equivalentes** al checkout. Lint focal, tipos de producto y tipos de pruebas pasaron. El archivo de HTTP real añadido después también pasó lint y tipos de pruebas; no se atribuye su cobertura al primer control anterior.

El archivo Native de HTTP real aprobó **un caso completo**, sin filtros ni omisiones, con **2000 inputs registrados previamente y estables**. Usa el App Router construido, PostgreSQL y cookies Better Auth firmadas reales. Recupera el original de versión uno con la recencia invalidada, consulta por separado la configuración actual de versión dos y comprueba que el POST nuevo sigue cerrado con `reauthentication_required`. Verifica `no-store` y `no-referrer` y compara después conteo/versiones del ledger y ajustes actuales para descartar efectos de lectura. No simula otro Google ni afirma habilitación positiva por ese POST cerrado.

El total focal es **57 casos distintos en cinco archivos completos**: 54 locales, dos Native de repositorio/lector y uno Native de HTTP. Las repeticiones y los intentos fallidos se conservan por separado y no se suman. Las dos secciones de arquitectura se renderizaron en **ocho vistas** Chromium/WebKit, 390 y 1280 px, con enlaces locales disponibles y sin desbordes. No hay una pantalla nueva que capturar o un recorrido ficticio que añadir al manual.

La [evidencia sanitizada](admission-notification-settings-recovery-results.json) conserva hashes y scopes de cada comprobación. La conciliación oficial posterior a todos los procesos Native confirmó **cero ramas temporales propias** y preservó producción, el piloto original y la rama ajena `dev-sandbox-guido`. La propiedad se determinó por receipts exactos. No se enviaron mensajes externos; el worktree construido se archiva tras preservar sus receipts.

## Alcance pendiente

La pantalla deberá conservar UUID e intención, consultar el original ante una respuesta incierta y conciliar mediante la lectura actual sin hacer retroceder una versión más nueva. No existe todavía ese control en la interfaz. El manual del historial conserva su recorrido y trazabilidad actuales porque no cambian sus controles.

Siguen pendientes agrupación y resumen enviado, outbox, dispatcher, mantenimiento, driver y ensayos operativos. Este incremento no cierra T184, T185, US8 ni T211. El CI aprobado de `267e3adb` valida el checkpoint anterior, no estos cambios posteriores.
