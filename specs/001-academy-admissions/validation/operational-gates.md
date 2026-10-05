# Registro de gates operativos

**Feature**: `001-academy-admissions`. **Registro inicial**: 2026-10-05, preparación sobre `7198047f126bcde6b0a5f0cdb60abf4191903e10`.

Este registro distingue preparación local de activación productiva. Ningún gate se considera aprobado por instalar un SDK, obtener acceso administrativo o pasar una prueba sintética. Los identificadores, requisitos y cierres de [research.md](../research.md#gates-operativos-conocidos), [spec.md](../spec.md) y [technical-contract.md](../technical-contract.md) siguen vigentes.

| Gate | Estado y evidencia disponible | Evidencia pendiente y cierre vigente |
| --- | --- | --- |
| OG-01 — Identidad y autenticación reciente | Pendiente. El transporte de prueba ejerce el verificador nativo de Better Auth con una firma RSA y JWKS generados; rechaza audience y nonce distintos. | Integración del callback con captura acreditada, intención de un uso, cuenta/sesión/rol actuales y `auth_time` firmado reciente. Security Bundle y cliente Google preparados deben acreditarse; no hay autorización para cambiar el proyecto OAuth. Login sigue obligatorio; recencia insuficiente cierra la operación sensible. |
| OG-02 — Secretos y recuperación | Pendiente. No se guardaron credenciales Zavu ni se configuraron keyrings externos. | Keyrings separados, `MESSAGING_SECURITY_EPOCH`, compatibilidad de Node/Workers, aislamiento/AAD, retiro/rotación y restore cerrado ensayados. Hasta entonces no guardar ni activar credenciales operativas y no despachar. |
| OG-03 — Zavu por canal/versión | Pendiente. SDK oficial `0.57.0` instalado; pruebas HTTP sintéticas con SDK real, `maxRetries:0` y logging apagado. | Cada líder aporta sus propias credenciales y recursos. Se necesita autorización explícita del pagador y destinos de diagnóstico; acreditar producción, acceso efectivo, sender/canal y plantilla Authentication/idioma cuando corresponda, código recibido y ausencia de fallback. Países deben configurarse antes del diagnóstico telefónico. No se enviaron mensajes reales; ningún canal está preparado por esta evidencia. |
| OG-04 — Deduplicación incierta | Pendiente. El transporte simula aceptación seguida de pérdida de respuesta y observa un solo POST con retries del SDK apagados. | Ensayo autorizado de ventana, scope, huella de payload y respuesta 409 correlacionada. Hasta acreditarlo, conservar `unknown` y su cupo, sin rePOST automático; consultar solo IDs propios conocidos. |
| OG-05 — Scheduler y latencia | Pendiente. No se configuró cron, hosting ni driver externo. | Driver autorizado en funcionamiento, contexto cerrado, no omisiones silenciosas y capacidad/p95 medidos; polling focal de avisos y entrega agrupada desde cierre de ventana. No certificar SC-015 ni habilitar correo dependiente solo por una configuración documental. |
| OG-06 — Persistencia y activación | Pendiente. Inventario de writers revalidado y acceso administrativo al proyecto Neon `TuTribu` confirmado después de renovar la sesión. | Rama propia, SQL versionado real, rol runtime y rol sin bypass, fixtures sintéticos, concurrencia, rutas gratuitas/pagas y cleanup comprobados. Acceso a Neon no acredita SQL. Ninguna academia se activa como protegida antes del cierre completo; el rollback posterior conserva el cierre de nuevas admisiones. |

## Autorizaciones y recursos

- El usuario autorizó implementar la feature existente y publicar avances mediante commit y `push --no-verify`. La revisión humana de `checklists/admission-review.md` conserva sus 71 casillas pendientes; no se modificó para representar progreso de implementación.
- AGENTS y la constitución autorizan permanentemente crear, migrar, sembrar y eliminar ramas Neon efímeras propias de `cold-firefly-92947172`, incluido un rol temporal sin bypass cuando haga falta. Esta autorización no permite mutar la rama default/producción ni ejecutar allí `pnpm db:migrate`.
- El usuario renovó la sesión local Neon después de un `401`/`invalid_grant`; la comprobación posterior respondió `200` para el proyecto autorizado. No se registraron tokens, conexiones ni datos personales.
- Siguen pendientes la autorización de consumo Zavu por canal y destino, las credenciales y recursos de cada líder, la configuración de hosting/keyrings/época, el cliente Google preparado y un driver de producción. La implementación local debe mantener cerradas esas capacidades.

## Evidencia de preparación

Node `24.21.0`, pnpm `12.6.0` y `pnpm install --frozen-lockfile` verificados. Los siete casos de `pnpm test tests/support/admission-provider-transport.test.ts` pasaron: SDK real con rutas registradas, denegación sin red, pérdida de respuesta sin duplicar POST, cancelación, Google/JWKS real, scopes globales excluyentes y aborto previo sin efecto. Pasaron `pnpm lint`, `pnpm typecheck` y `pnpm typecheck:tests`. Se registrarán los ensayos reales posteriores con su alcance y resultados antes de cambiar el estado de un gate.
