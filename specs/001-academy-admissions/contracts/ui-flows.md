# UI Flow Contract

**Estado**: recorridos a implementar, no pantallas disponibles hoy. UI en español; nombres técnicos/paths en inglés. [HTTP](http-api.md), [errores](errors-and-recovery.md), [spec completo](../spec.md). Aplicar [DESIGN.md](../../../DESIGN.md), SCSS Modules/BEM, beez-ui real y composición semántica sin Cards nuevas.

## Entrada, permisos y superficies

| Superficie propuesta | Entrada/audience | Comportamiento |
| --- | --- | --- |
| `app/(admission)/admissions/[slug]/page.tsx` | Enlace común o CTA de academia; información pública y login para acciones | Fuera del layout que exige membership; conserva regreso y estado propio |
| `.../admissions/invitations/[token]/page.tsx` | Invitación nominativa nueva | Leer no consume/envía; mensaje genérico para cuenta incorrecta/recurso no disponible; no divulgar destinatario |
| `.../admissions/requests/[requestId]/page.tsx` | Cuenta autenticada sobre su request | Estado persistente, prueba requerida/fechas/mensaje externo/cancelación propia; sin contenido de tribu |
| `app/(platform)/[slug]/academia/admissions/...` | Líder para configuración/lista/invitaciones/conexiones; líder/guardián activos para bandeja | Permisos y estado actuales, no botones como autoridad; sin secretos para guardianes |
| `app/auth/reauthenticate/page.tsx` | Intención global propia para acción sensible | Evitar redirect convencional que impide reauth con sesión; no prometer desafío Google forzable |

Son paths propuestos y se integran con el menú real. El `AcademyHome` actual cambia su CTA por el recorrido correspondiente y recibe callbacks desde container. Canjes históricos de academia llevan a política común sin dispensa; legacy conserva su experiencia. No presentar UI general de gestión/recuperación de roles como existente.

## Container/presenter y red

Server page obtiene datos iniciales con una entrada principal: use case → application result → view model propio validado. Container de cliente posee sesión, draft, validación/mutations, consultas posteriores y cancelación; presenters reciben props/callbacks. Sin SDK/provider DTO, llamada externa dispersa ni adapter `lib/*api*` dentro de presentación.

RSC/params/cookies/headers resuelven dentro de Suspense del segmento activo; cada hoja tiene loading propio. Layout no awaits params, ni `instant=false`. Error boundary/render y handlers/async se cubren por separado. Primera hidratación determinista: fechas/zonas/due times iniciales desde servidor, countdown después de hidratar, sin media/browser storage antes de tiempo.

Usar Link compartido con prefetch false por defecto; la visita/prefetch es lectura. Mutaciones actualizan el resultado mínimo: fila/estado/counters/capacidad. Sin route refresh por política/lista/preview/código/diagnóstico/decisión/preferencia. Si se necesita recargar por cambio real de sesión/seguridad/pertenencia, documentar esa excepción y probarla; navegación explícita al contenido tras admitir es válida y reautoriza en servidor.

## Recorridos de solicitante

1. Identificar cuenta/tribu y devolver pertenencia/pendiente existente antes de nuevos efectos. Un activo/silenciado conserva rol/fecha/estado; ninguno repite prueba al visitar.
2. Mostrar qué ocurrirá: “Solicitar ingreso” solo cuando quedará pending; “Ingresar gratis” cuando la política permite admisión inmediata. Explicar cuenta, dato declarado, evidencia base y código local como conceptos diferentes.
3. ON exige código local del contacto/canal de la tribu, incluso Gmail acreditado. OFF no envía OTP oculto; lista/nominativa exige evidencia base. Manual común OFF permite cuenta autenticada sin probar contacto.
4. Código: destino enmascarado/canal permitido, solicitud explícita, espera/límites visibles, campo/feedback y estados de envío separados de verificación. SMS alternativo solo por elección al mismo número cuando está preparado; nuevo código invalida anterior.
5. Confirmar presentación/canje después de cumplir requisitos. Incorrecto/preview/login/prueba aislada no consume enlace. Un token no se vuelve común silenciosamente: abandonar intento y elegir otra vía es acción explícita.
6. Pending muestra plazo original y quién resuelve, avisos disponibles sin prometer correo. Prueba nueva se adjunta al mismo pedido; no duplicar ni reiniciar treinta días. Contacto ya fijado cambia solo cancelando/reintentando legítimamente.
7. Rechazo/cancelación/expiry muestra mensaje externo y próxima fecha. Contacto ajeno en conflicto ofrece cuenta original/ayuda sin nombre/identidad ajenos ni reasignación por código. Bloqueo no recuperable no se salva con vínculo/pago.

## Administración

- **Política:** modalidad/contacto antes de activar, check adicional, excepciones/apertura independientes. Mostrar impacto/defaults/versiones; lista telefónica OFF no guarda. Tipo fijado no cambia. Feature activa sin política no vuelve a ingreso abierto.
- **Lista/importación:** buscar/filtrar por tribu, alta/estado, CSV y preview con selección/outcome por fila. Deshabilitar no expulsa; reimport no borra/reactiva/reasigna. Nombre orientativo no sustituye identidad. Reporte trata fórmulas/HTML como datos.
- **Invitaciones:** nombre interno y destinatario exacto, casilla de lista, expiry o sin vencimiento advertido; mostrar URL una sola vez. Solo nombre editable. Reemplazo/revocación explícitos; canje terminal nunca reciclado.
- **Bandeja:** más antiguas primero, filtros, fuente/evidencia/eligibilidad y motivo seguro. Liderazgo/guardianes activos deciden; guardián no administra claves/lista/preferencias ajenas. Aprobar no dispensa lista nominativa; rechazo/motivo interno y mensaje externo son campos distintos.
- **Lote:** hasta 50 filas visibles elegidas; selección e impacto confirmados. Mostrar éxitos/conflictos/pendientes reales, conservar resultados; ninguna fila oculta/repetición silenciosa ni éxito global mixed.
- **Conexión:** clave protegida en campo efímero, validación sin mensaje, sender/canal/template/idioma y requisitos reales. Form vacío tras guardar; no recupera key. Guardar/editar no prueba. Cada diagnóstico tiene destino y advertencia de consumo más código recibido; versión/canal exactos.
- **Rotación/suspensión:** candidata no reemplaza activa antes de confirmación; mostrar dependencias/cupos/historia. Stop urgente disponible; no promete retirar mensaje aceptado. Transferencia suspende antes de nuevos despachos y nuevo líder no ve key anterior.
- **Consumo:** UTC/ventana y cupos diferenciados, países explícitos, no gasto exacto inferido. Incremento requiere confirmación; reducción afecta cola futura y no aceptación previa. Cuota cero detiene envíos, no dispensa ON.

## Feedback, polling y accesibilidad

Prevalidar campos/selección antes de acción y mostrar error/helper junto al control; foco en primer problema, alert/status persistente y toast complementario. Limpiar feedback anterior al corregir o cambiar contexto; no borrar draft/progreso confirmado por un fallo. Código/credencial/provider messages no se imprimen en errores.

Actualizar lista/estado/counters propios de admisión visibles cada 15 s cuando la ventana está activa, con igualdad guard y un punto de fetching/coalescing. Aplicar la misma política contextual al centro de notificaciones cuando corresponda, no solo badge. Background/blur pausa; al volver reconciliar. AbortController y cambio de sesión/slug invalidan respuestas; abort de lectura no notifica error. Estado anterior con aviso de desactualizado/reintentar si falla consulta, sin vacío definitivo engañoso.

Móvil/escritorio, teclado/lector, foco restaurado y significado fuera del color. Unidades fluidas y convenciones viewport (`svh` para min-height/scroll, `dvh` solo overlay fullscreen). Motion/primitivas aprobadas, sin ocultar HTML inicial ni reanimar primitivas; reduced motion respetado. Validación final Chromium/WebKit a 390/1280 px con datos sintéticos, incluidos todos los estados ON/OFF, proveedor ausente/caído, stale, quota, wrong-account, pending y partial/unknown.

## Copy normativo

Conservar el significado de todas las filas “Pantallas, formularios y mensajes” de spec.md. Mensajería incompleta al solicitante: “La academia todavía no puede enviar el código. No se completó la verificación”. Prueba del líder: “Este envío puede generar consumo en tu cuenta de Zavu”. Nunca badge verificado para declarado ni instrucciones que permitan saltar evidencia/lista/bloqueo. SDK/HMAC/lease/job no se exponen como pasos de producto.

## Documentación de implementación

Actualizar el manual temático de ingreso (`academy-mode.html`/`joining-options.html`) y los topics pertinentes de cuenta, miembros, notificaciones/operaciones/media, junto con index/application-flows, preservando trazabilidad y navegación. Crear tema independiente de admisión/mensajería si el recorrido no cabe con owner claro; la implementación determina el archivo real y aplica user-manual. Arquitectura/conventions/user-manual bajo docs usan .htm; controles y artefactos Spec Kit permanecen .md. CHANGELOG Unreleased describe cambios para integrantes/creadores. No publicar/commitear manuales sin autorización del trabajo de entrega.
