# Quickstart Validation: Academy Admissions and Tenant Messaging

**Estado**: guía para validar después de implementar. Hoy solo existen especificación/diseño; los comandos de los casos nuevos necesitan sus archivos implementados. Ningún procedimiento siguiente se ejecutó para declarar la feature probada.

[Contrato funcional](spec.md), [modelo](data-model.md), [HTTP](contracts/http-api.md), [auth](contracts/auth-evidence.md), [mensajería](contracts/messaging-provider.md), [errores](contracts/errors-and-recovery.md), [UI](contracts/ui-flows.md), [trazabilidad](traceability.md).

## 1. Preparación y límites

1. Completar/revisar las tareas que genere `$speckit-tasks`, con TDD y artefactos SQL reales. No usar esta guía como migración o implementación en sí misma.
2. Node de `.nvmrc` (24.21.0), pnpm 12.6.0, lockfile consistente, SDK Zavu fijado/real y runtimes del plan. Claves de pruebas sintéticas en memoria/entorno aislado, nunca secretos/usuarios productivos en fixtures/logs.
3. Crear rama efímera Neon con esquema real, fixtures sintéticos de A/B y rol de runtime más un rol no-bypass de privilegios mínimos. Nunca probar escrituras en default/producción. La autorización permanente de estas ramas propias no autoriza migración productiva.
4. Preparar solo cuando corresponda cuentas Google de prueba y proyecto con evidencia/recencia disponibles. Entrega real Zavu exige cuentas/recursos/destinos preparados y consentimiento explícito de quien paga. Sandbox también puede enviar realmente.
5. Keyrings/época/dispatcher de ambos targets se validan sin publicar ni contratar recursos por esta guía. Para producción se exige decisión/autorización separada; ausencias mantienen capacidades cerradas y evidencia pendiente.

## 2. Comandos del repositorio

Tras implementar los archivos y pruebas correspondientes:

```powershell
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run typecheck:tests
pnpm exec vitest run tests/unit/modules/academy-admissions tests/unit/modules/messaging tests/unit/modules/auth
pnpm test
pnpm run build
```

Los paths de las suites nuevas son propuestos; su contenido/contratos están trazados, no creados por planificación. Usar tests reales de validators/SDK/Better Auth/beez-ui y dobles solamente en bordes propios. No escribir tests que inspeccionen texto de fuentes/SQL/config o solo imports/build artificiales.

El hook pre-push ejecuta el gate completo al publicar; no duplicarlo aquí si ya hay evidencia exacta suficiente y no cambió código, ni saltarlo ante una falla. No hacer commit/push/deploy como parte de esta planificación.

## 3. Persistencia y rol efectivo

En la rama efímera:

- Aplicar los archivos versionados reales pendientes, no una reescritura ad hoc del SQL. Verificar constraints/índices/FK y el cierre de todos los writers del inventario R-02.
- Registrar únicamente metadata de rol y seguridad: `current_user`, `rolsuper`, `rolbypassrls`, grants, RLS/FORCE y EXECUTE de funciones; nunca connection string o filas personales. La documentación actual no permite asumir que el runtime obedece RLS.
- Seed mínimo: líder/guardián/tribemate activos, muted, dos causas comerciales, conducta, remoción administrativa, rol histórico privilegiado, histórico sin snapshot, membresía/grant vigente/expirado/revocado, policy A/B, lista, invitaciones y pruebas locales.
- Ejecutar los mismos ataques por API y escrituras directas con rol no-bypass/runtime efectivo: cuenta/tribu/objeto cruzados, booleano `app.*`/`paid=true`, policy ausente/flag apagado y acceso a secretos. Autoridad de writer/constraints no puede depender de UI.
- Mantener logs de metadata/resultados/correlation. Borrar la rama propia al terminar, incluso si falló; conservar reporte sanitizado y no decir que pasó lo no ejecutado.

## 4. Matrices funcionales completas

| Grupo | Ejercicio real requerido | Resultado esperado |
| --- | --- | --- |
| V-01 Política | Todas las filas de configuración/admisión/revisión y permisos; stale edit; tipo fijado; flag/ausencia | Misma matriz del spec, sin apertura implícita ni autoaprobación |
| V-02 Identidad | Google firmado Gmail/Workspace/external, hd ausente, header/issuer/aud/sub/nonce/exp incorrectos; callbacks A/B | Base solo acreditada, global login separado, datos browser sin autoridad |
| V-03 Recencia | auth_time reciente/antiguo/ausente, sesión renovada, cuenta distinta, intento repetido y liderazgo perdido | Diez minutos acreditados o cierre de acción sensible; ningún OTP BYOK global |
| V-04 Contacto/código | Correo/SMS/WhatsApp, ON/OFF, cinco fallos, ventanas globales, resend/SMS alternativo, cuota agotada | Uso único/contexto/época correctos; anteriores inválidos; código vigente validable sin nuevo envío |
| V-05 Lista/CSV | 10.000 filas, cinco MiB, datos/formato inválidos, HTML/fórmulas, duplicados/deshabilitados/reimport/concurrencia y version de entrada/no-op/stale | Preview sin efectos, outcomes por fila, sin reasignar/reactivar/eliminar, CAS 409 sin overwrite, reporte seguro/purga |
| V-06 Invitación | Personal/common/historical, lista obligatoria/dispensa, expiry opcional, wrong-account/preview, perdido/revocado/canjeado y versiones/canje-revoke concurrentes | Un canje válido máximo, CAS interno/admin 409 y metadata versionada; token una vez; no vía común silenciosa ni reciclar terminal |
| V-07 Decisiones | Individual/lote 50, motivos/versiones, aprobar/rechazar concurrentes, pausa/expiry, proof adjunta días después | Una terminal coherente con membresía/eventos; mixed real, sin inventar commits |
| V-08 Conexión/secretos | Inicialización/países sin conexión antes de diagnóstico telefónico, me, recursos paginados, candidata, prueba por versión/canal, rotación/compromiso/retiro/transferencia | Credencial distinta de canal probado; nunca key/OTP/DTO raw en salida; permisos actuales |
| V-09 Entrega/cupos | Marker antes RPC, crash/timeout/lease, 409, A/B, último cupo concurrente, reducción/cambio key, países/version de uso vigente | Unknown conserva identidad/cupo y no rePOST ciego; país retirado antes de marker suprime sin RPC; no cruce de contexto/pagador/reset |
| V-10 Avisos/scheduler | Sin proveedor, email independiente/preferencias/rol perdido, grupo/diario/reminder, poll/lista/cursor | Estado interno persistente y propio; no historial retroactivo; correo no revierte decisiones |
| V-11 Regresión/corte | Vías gratuitas/pagas/directSQL/invitación vieja/reconcile, grants, muted, fundamentos y rollout/restore | Ningún bypass; solo base; moderación/fuentes comerciales preservadas; cierre posterior a activar |
| V-12 UI/seguridad/operación | Teclado/lector, 390/1280, Chrome/WebKit, hydration/loading/errors, métricas/retención | Estados/copy recuperables, sin datos/roles ajenos ni información sensible |

La matriz no sustituye los 71 escenarios, 45 EC, 21 SC ni 142 FR. `traceability.md` conserva cada uno individualmente y los relaciona con estos grupos, archivos/casos propuestos y documentación.

## 4.1. Revisión I1: países antes de diagnóstico y por intento

Casos previstos; ejecutarlos después de sincronizar tareas/implementar. [Modelo](data-model.md#country-policy), [HTTP](contracts/http-api.md) y [mensajería](contracts/messaging-provider.md) fijan el contrato completo. Usar transporte propio/puertos para reglas y SDK real en su borde; ensayos externos siguen sujetos a OG-03/autorización.

| Precondición / acción | Resultado requerido | Grupo |
| --- | --- | --- |
| Leader válido, ninguna conexión/AdmissionPolicy; leer usage-policy | not_configured/defaults sin versión persistida ni efectos/SDK | V-08 |
| Inicio explícito del asistente; inicializar uso | Defaults del spec, allowedCountries [], version 1; carrera de inicialización devuelve existente sin reset/duplicado | V-08/V-09 |
| [] y candidata SMS/WhatsApp preparada; pedir diagnóstico o activar teléfono | Sin despacho/activación telefónica; feedback de países antes de la prueba; sin consumo de intento externo | V-01/V-08 |
| Guardar países con expectedVersion antes del primer diagnóstico | Un único owner, nueva versión efectiva, usable sin conexión activa; AdmissionPolicy lee por puerto | V-01/V-08 |
| Número ambiguo o país body incoherente con E.164 | Corrección/denegación; nunca adivinar país ni usar el body para evitar restricciones | V-04/V-09 |
| País fuera de lista o restricción de plataforma/proveedor comprobada; código/diagnóstico/SMS alternativo | Sin RPC ni sustitución de canal/destino; no catálogo Zavu inventado | V-04/V-08/V-09 |
| [] en manual/teléfono/OFF común y correo preparado | Solicitud manual/avisos internos y correo autorizado independientes; no nueva nominativa phone OFF | V-01/V-04/V-10 |
| Cola creada con país permitido; quitarlo antes de marker | Reload de uso actual, suppressed/recipient_not_allowed sin RPC ni cupo externo; request/abuse counts conservados | V-09 |
| Retirar país después de inicio/accepted/unknown | Estado/cupo/identidad conservados, sin prometer cancelación ni rePOST | V-09 |
| Código válido ya emitido o prueba aplicada; quitar país | Validación local/evidencia conserva contexto/TTL/época; nuevos envíos/reenvíos restringidos, sin borrar pending/membership | V-04/V-09 |
| Cambiar países o cupos y revisar consumo/épocas/conexión | Incremento de configuración único; sin reset, cambio de verificationEpoch o connectionVersion; registrar versión efectiva del intento | V-08/V-09 |

## 4.2. Revisión U1: versiones, no-op, CAS y replay

Ejercer los mismos casos para lista, metadata de invitación y política de uso, con SQL real y DTOs propios/validators reales. Las precondiciones incluyen audiencia y rol/estado vigentes. [Regla común](data-model.md#resource-versioning), [recuperación](contracts/errors-and-recovery.md).

| Precondición / acción | Resultado requerido | Grupo |
| --- | --- | --- |
| Crear recurso nuevo mediante acción autorizada | version 1 positiva no nullable; DTO de lectura/result la expone; sin expectedVersion 0 | V-05/V-06/V-08 |
| Input expectedVersion 0/negativo/fracción/no seguro en actualización | Rechazo de input antes de efectos; ningún recurso/operación aceptada inventados | V-05/V-06/V-08/V-12 |
| Misma versión vigente, valores normalizados iguales | unchanged, versión/counters intactos y sin evento/entrega duplicados | V-05/V-06/V-09 |
| Misma versión vigente, varios campos efectivos cambiados | Un commit y un incremento por comando, resultado/versión confirmados | V-05/V-06/V-09 |
| Nueva operación con versión antigua, incluso valor ahora coincidente | 409 conflict de recurso; sin overwrite/auto retry, draft conservado | V-05/V-06/V-09/V-12 |
| Dos writers con misma versión y cambios efectivos distintos | Solo un commit; otro 409, nueva lectura/confirmación con otra identidad | V-05/V-06/V-09 |
| Se pierde respuesta tras commit; replay del mismo operation/intent esperado antiguo | Resultado/versión del commit original antes de CAS; cero incremento/efecto adicional | V-05/V-06/V-09 |
| Cambia recurso después del commit original; llega replay/response tardía | Versión histórica distinguida de consulta vigente; UI no pisa versión más nueva | V-05/V-06/V-12 |
| Misma identidad con expectedVersion/payload cambiado | idempotency_conflict; no nueva aceptación ni actualización silenciosa | V-05/V-06/V-09 |
| Invitación rename/revoke/redeem/expiry materializada; canje-revoke competidores | Incremento una vez por transición efectiva; CAS interno de canje, admin stale 409, terminales/cancelación/eventos atómicos | V-06/V-07 |
| GET deriva expiry o invitación ya canjeada alcanza plazo viejo | Sin escritura/incremento por lectura; canjeada no vence ni se recicla | V-06 |
| Reemitir o repetir creación con enlace inicial perdido | Nuevo recurso version 1 por reemisión; replay original solo metadata, nunca URL/token recuperado | V-06 |
| Importar duplicados, aplicar binding, reservar/consumir cupo o consultar | Semántica original conservada; no incremento si el recurso configurado no cambia ni reset de contadores | V-05/V-09 |

Estos casos concretan FR-009/065/066/070/072/086/089/098/131, EC-10/11/17/28/35/36, SC-001/005/009/010/011/017 y TC-019/020/021/022/024/026 según corresponda; no renumeran ni sustituyen sus obligaciones. La próxima etapa de tareas debe crear/asignar los casos concretos por archivo y actualizar trazabilidad. Todos siguen pendientes.

## 5. Carreras que no pueden omitirse

- Cien canjes simultáneos: como máximo un efecto y recuperación idempotente de resultado; cuenta incorrecta nunca consume.
- Cien aprobaciones/rechazos de una pendiente: una terminal; sin aprobada sin membresía, canje sin solicitud o aviso duplicado.
- Último cupo con cien despachos: un despacho autorizado; alternar canal/clave/dispositivo no reinicia límites.
- Cambio OFF→ON/canal/compromiso mientras se aplica proof o decide: versión/época y reglas de pruebas adjuntas correctas; no reiniciar plazo.
- Rol/estado del actor o solicitante cambia con locks retenidos; comprobar autoridad y reloj después de esperar, no solo al entrar.
- Respuesta perdida después de commit: mismo operation id devuelve resultado, no crea otra solicitud/decisión/invitación/claim.
- CSV bloque posterior falla: resultados previos se conservan; retry solo pendientes elegibles. Lote DB-only rollback no reporta éxitos inventados.
- Cambio de países/cupos mientras espera la reserva/marker: evaluar versión/política vigente bajo locks, suprimir solo trabajo aún no autorizado y conservar cupo de intento iniciado.
- Dos cambios de entrada/invitación/uso con expectedVersion igual; respuesta perdida/replay frente a cambios posteriores: un efecto, CAS para nuevos intents y replay confirmado antes de CAS.
- Crash entre `send_authorized_at` y RPC/finalización: unknown conservador. Lease local no habilita otro POST; payload distinto con misma idempotencia no se toma como éxito.

## 6. Regresiones de pertenencia y fuentes

Secuencias obligatorias, en los tres escritores de reconciliación y por API/directSQL:

1. Muted → bloqueo/remoción comercial → pago o admisión gratuita elegible: muted, misma fecha/rol permitido; snapshot capturado antes de ocultar estado.
2. Recuperación básica gratuita nueva → webhook/reconcile de suscripción vieja inactiva: el fundamento básico vigente permanece; ni grants ni cobros se restauran.
3. Remoción administrativa/conducta → pago/aprobación/CSV/token: restricción intacta.
4. Fila comercial guardian/leader o snapshot histórico NULL: no activar/degradar/inventar estado; preflight/resolución autorizada y auditada, no UI fingida.
5. Miembro válido obtiene fuente comercial mientras tenía pendiente: cancelada por resolución externa, sin liberar invitación.
6. Salir/reingresar: fundamento previo no funciona como autorización perpetua; nueva evaluación/decisión. Policy borrada/flag apagado tras activar: cerrado.
7. Checkout open-join invocado directamente en academia: el resolver viejo no sortea modo/producto. Bootstrap solo crea el líder inicial de su tribu.

## 7. UI local y navegadores

Reutilizar ruta activa de portless:

```powershell
portless list
pnpm run dev
```

Si ya existe `https://dev-tutribu.app`, no iniciar otro servidor. Abrir ese hostname; no localhost:3000 para verificaciones manuales. Playwright usa su webServer documentado en la suite; ejecutar casos reales con el entorno aislado del producto, sin librerías UI mockeadas.

Recorrer manual común OFF sin Zavu, lista de correo base, teléfono lista inválido OFF, todos ON, excepción/nominativa, wrong-account/change-account, pending/proof nueva/terminal, form secreto/reauth/provider down/quota/stale, CSV mixed y decisiones mixed. Verificar foco/helper/alert, limpieza de feedback/draft/progreso, cero escrituras por lectura y cero full refresh salvo excepción documentada de seguridad. Capturas usan datos sintéticos.

## 8. Ensayos Zavu autorizados

No ejecutarlos sin autorización y recursos del pagador. Separar producción de sandbox, que también envía realmente y no prueba sender productivo/email/SMS. Por cada canal/versión registrar actor, fecha, request id, resultado e IDs sanitizados, sin key/código/destinatario completo.

Inicializar la política de uso y guardar allowedCountries/version antes de cualquier diagnóstico telefónico; comprobar []/país rechazado mediante transporte controlado sin enviar a destinos no autorizados. Probar me/autenticación/permisos, sender/capacidad, template/idioma, diagnóstico con código recibido, A/B intercalado, ausencia de fallback bajo fallo WhatsApp, restricciones de país/destino, saldo/degradación/rotación y retirada. Sin recurso preparado, marcar pendiente y no sustituirlo por un mock productivo.

Deduplicación exige evidencia de ventana/scope, mismo payload y payload distinto, timeout/409 original. Sin ella mantener unknown/no rePOST. Consulta por ID propio; no enumerar historial para buscar una clave que la API no consulta.

## 9. Keyrings, restore y objetivos

Ensayar cifrado/descifrado real en Node/Workers, AAD/keyId/época cruzados, crypto de OTP, retirada y purga. Restaurar solo copia aislada: cerrar drivers, cambiar época/keys fuera del snapshot, verificar que ciphertext/conexión/outbox antiguos siguen inutilizables, reconectar explícitamente y nunca volver al writer abierto.

SC-013: dataset 10.000 entradas y cien solicitudes concurrentes, p95 de confirmación menor a tres segundos con exclusiones del spec medidas aparte. SC-014: prueba de tareas con diez personas, nueve o más completan antes de dos minutos. SC-015: disponibilidad→aparición in-app con contextos activos/poll focal, y windowClosedAt→providerAcceptedAt del correo agrupado dentro del objetivo; medir p95/backlog/saltos del driver. Un schedule declarado no certifica latencia.

El target Vercel Hobby/GitHub actual no acredita un disparador frecuente fiable; gate OG-05 necesita driver autorizado/medido. Cloudflare por minuto es una opción del target alternativo, no un recurso supuesto ya desplegado. Mantener métricas/alertas en TuTribu aun si el canal de aviso está averiado.

## 10. Evidencia de cierre de implementación

Por FR/AC/EC/SC/TC guardar caso/archivo, entorno/commit, actor/recurso sintéticos, expected/observed y documentación actualizada. Diferenciar unit/contract/SQL/UI/ensayo externo y pendiente/fallido/aprobado. No marcar la checklist temática por un checkbox documental. Borrar recursos efímeros propios; productivo requiere solicitud separada. El informe final debe declarar exactamente qué no se pudo validar y por qué, sin certificar entrega ni cumplimiento legal por esta guía.
