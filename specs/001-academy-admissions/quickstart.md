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
| V-05 Lista/CSV | 10.000 filas, cinco MiB, datos/formato inválidos, HTML/fórmulas, duplicados/deshabilitados/reimport/concurrencia | Preview sin efectos, outcomes por fila, sin reasignar/reactivar/eliminar, reporte seguro/purga |
| V-06 Invitación | Personal/common/historical, lista obligatoria/dispensa, expiry opcional, wrong-account/preview, perdido/revocado/canjeado | Un canje válido máximo; token una vez; no vía común silenciosa ni reciclar terminal |
| V-07 Decisiones | Individual/lote 50, motivos/versiones, aprobar/rechazar concurrentes, pausa/expiry, proof adjunta días después | Una terminal coherente con membresía/eventos; mixed real, sin inventar commits |
| V-08 Conexión/secretos | me, recursos paginados, candidata, prueba por versión/canal, rotación/compromiso/retiro/transferencia | Credencial distinta de canal probado; nunca key/OTP/DTO raw en salida; permisos actuales |
| V-09 Entrega/cupos | Marker antes RPC, crash/timeout/lease, 409, A/B, último cupo concurrente, reducción/cambio key | Unknown conserva identidad/cupo y no rePOST ciego; no cruce de contexto ni cambio de pagador |
| V-10 Avisos/scheduler | Sin proveedor, email independiente/preferencias/rol perdido, grupo/diario/reminder, poll/lista/cursor | Estado interno persistente y propio; no historial retroactivo; correo no revierte decisiones |
| V-11 Regresión/corte | Vías gratuitas/pagas/directSQL/invitación vieja/reconcile, grants, muted, fundamentos y rollout/restore | Ningún bypass; solo base; moderación/fuentes comerciales preservadas; cierre posterior a activar |
| V-12 UI/seguridad/operación | Teclado/lector, 390/1280, Chrome/WebKit, hydration/loading/errors, métricas/retención | Estados/copy recuperables, sin datos/roles ajenos ni información sensible |

La matriz no sustituye los 71 escenarios, 45 EC, 21 SC ni 142 FR. `traceability.md` conserva cada uno individualmente y los relaciona con estos grupos, archivos/casos propuestos y documentación.

## 5. Carreras que no pueden omitirse

- Cien canjes simultáneos: como máximo un efecto y recuperación idempotente de resultado; cuenta incorrecta nunca consume.
- Cien aprobaciones/rechazos de una pendiente: una terminal; sin aprobada sin membresía, canje sin solicitud o aviso duplicado.
- Último cupo con cien despachos: un despacho autorizado; alternar canal/clave/dispositivo no reinicia límites.
- Cambio OFF→ON/canal/compromiso mientras se aplica proof o decide: versión/época y reglas de pruebas adjuntas correctas; no reiniciar plazo.
- Rol/estado del actor o solicitante cambia con locks retenidos; comprobar autoridad y reloj después de esperar, no solo al entrar.
- Respuesta perdida después de commit: mismo operation id devuelve resultado, no crea otra solicitud/decisión/invitación/claim.
- CSV bloque posterior falla: resultados previos se conservan; retry solo pendientes elegibles. Lote DB-only rollback no reporta éxitos inventados.
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

Probar me/autenticación/permisos, sender/capacidad, template/idioma, diagnóstico con código recibido, A/B intercalado, ausencia de fallback bajo fallo WhatsApp, restricciones de país/destino, saldo/degradación/rotación y retirada. Sin recurso preparado, marcar pendiente y no sustituirlo por un mock productivo.

Deduplicación exige evidencia de ventana/scope, mismo payload y payload distinto, timeout/409 original. Sin ella mantener unknown/no rePOST. Consulta por ID propio; no enumerar historial para buscar una clave que la API no consulta.

## 9. Keyrings, restore y objetivos

Ensayar cifrado/descifrado real en Node/Workers, AAD/keyId/época cruzados, crypto de OTP, retirada y purga. Restaurar solo copia aislada: cerrar drivers, cambiar época/keys fuera del snapshot, verificar que ciphertext/conexión/outbox antiguos siguen inutilizables, reconectar explícitamente y nunca volver al writer abierto.

SC-013: dataset 10.000 entradas y cien solicitudes concurrentes, p95 de confirmación menor a tres segundos con exclusiones del spec medidas aparte. SC-014: prueba de tareas con diez personas, nueve o más completan antes de dos minutos. SC-015: disponibilidad→aparición in-app con contextos activos/poll focal, y windowClosedAt→providerAcceptedAt del correo agrupado dentro del objetivo; medir p95/backlog/saltos del driver. Un schedule declarado no certifica latencia.

El target Vercel Hobby/GitHub actual no acredita un disparador frecuente fiable; gate OG-05 necesita driver autorizado/medido. Cloudflare por minuto es una opción del target alternativo, no un recurso supuesto ya desplegado. Mantener métricas/alertas en TuTribu aun si el canal de aviso está averiado.

## 10. Evidencia de cierre de implementación

Por FR/AC/EC/SC/TC guardar caso/archivo, entorno/commit, actor/recurso sintéticos, expected/observed y documentación actualizada. Diferenciar unit/contract/SQL/UI/ensayo externo y pendiente/fallido/aprobado. No marcar la checklist temática por un checkbox documental. Borrar recursos efímeros propios; productivo requiere solicitud separada. El informe final debe declarar exactamente qué no se pudo validar y por qué, sin certificar entrega ni cumplimiento legal por esta guía.
