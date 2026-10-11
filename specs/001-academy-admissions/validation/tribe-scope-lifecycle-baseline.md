# Cierre del scope de admisión por el owner de tribus

Base de código `a359bc8a`; incremento de T160. Se conservan las 212 tareas; esta evidencia no cierra T153, T156, T159, T161 ni los gates externos.

## Decisión de ownership

`ManageTribeIdentityUseCases` sólo gestiona logo y portada. La salida de academia y la eliminación física pertenecen a `ManageTribeLifecycleUseCases` y `PostgresTribeLifecycleRepository`, compuestos por el root existente. `CloseAcademyAdmissionScopeUseCase` usa su puerto transaction-bound y el SQL versionado `20261011223000_close_admission_scope_lifecycle.sql`. La actualización de paths en T160 conserva todos sus criterios y referencias originales.

La API usa el UUID inmutable de la tribu y un UUID de operación, acción confirmada y CAS de configuración. No recibe actor, rol, autoridad ni fecha de autenticación del cliente. La cuenta/sesión nativas, el líder canónico único y la evidencia firmada específica se bloquean antes de ejecutar. El SQL fija el fence de tribu antes de recursos dependientes. La salida conserva miembros y marcador; el borrado retira el scope real y sus credenciales con el archive existente.

El original se guarda en `tribe_lifecycle_operations` con MAC del intento y DTO propio mínimo, RLS forzado y guard de inmutabilidad, independiente de la existencia del padre. Recuperar es sólo lectura, con la misma cuenta y el intento original. Después de un commit con respuesta perdida se intenta observar ese original antes de indicar incertidumbre; una nueva operación no se fabrica. La recencia se reevalúa con reloj SQL después de las esperas, del borrado y de la escritura del original. Los hechos firmados retenidos son privados y estaban bloqueados cuando el líder era vigente.

## Pruebas y regresiones

- Owner real: requiere propósito correcto, aplica CAS, conserva líder al salir, cancela pending, recupera/repite el original y reconcilia una respuesta perdida después del borrado. La cuenta global sobrevive y el UUID retirado no se puede reinsertar.
- Scope: pausa conserva pending e invitación activa; mode exit y DELETE directo de settings cancelan y revocan sin borrar marcador ni reactivar al restaurar settings.
- Entregas: cola sin intento se cancela; un RPC ya iniciado conserva exactamente intento, reserva e identidad durante el cierre y registra su recibo original una sola vez. Códigos y sobres dejan de autorizar; la verificación criptográfica real produce una prueba que también se invalida al salir.
- Deadline: después del cierre real se espera el vencimiento persistido usando reloj PostgreSQL. El owner rechaza y revierte pending, borrado, archive y original juntos.
- Canje: una invitación emitida y canjeada realmente conserva su tuple consumida y vínculo después de salir y volver. Repetir el original sólo consulta su resultado; otro intento no obtiene membresía.
- Pausa: tres casos Native seleccionados comprueban rechazo/cancelación con prueba aplicada y rechazo de aprobación después de contención real. Los 19 casos filtrados de ese archivo no se presentan como aprobados por esta ejecución.
- Next/Better Auth reales: input de autoridad rechazado, propósitos separados, UUID normalizado, salida/borrado, recovery después de retirar el padre y rechazo de sesión vencida. Contratos HTTP/uso y recencia locales ejercen Zod, Request/Response y políticas reales.

El rojo de invitación disponible confirmó el cierre incompleto anterior. El primer borrado rojo señaló una dependencia `purged_at` ausente en la preparación; con esa migración presente, PostgreSQL reprodujo `42501` en el cierre duplicado de settings por cascada. La corrección omite sólo la segunda llamada cuando su padre ya fue eliminado; el BEFORE DELETE de la tribu ya cerró admisión. Se corrigió también la recencia final y el mapping de pérdida de sesión del executor al error propio del lifecycle. No se modificaron assertions para aceptar los fallos.

## Validación final

Doce casos Native relevantes terminaron aprobados: owner/archive y Next/Better Auth actuales (2), mode exit/DELETE directo de settings con pausa y return (2), cola/RPC/prueba verificada (3), deadline real con rollback (1), canje y consulta/presentación durante pausa (1), y los tres casos seleccionados de pausa (3). Los nueve de los archivos nuevos no omiten casos; los 19 filtros del archivo existente son exclusiones deliberadas de esa ejecución focal. Los receipts privados son `codex-t160-canonical-final-owner-http.json`, `codex-t160-final-scope-native.json`, `codex-t160-scope-clock-native.json`, `codex-t160-personal-pause-fixed-native.json` y `codex-t160-pause-owner-native.json`. Todas sus sesiones terminaron exit0 con cierre de recursos propios.

Los 54 contratos locales de lifecycle y recencia pasan. Typecheck de aplicación/tests, lint y build real terminan exit0; la ampliación final de assertions y la preparación de consulta exacta vuelve a pasar typecheck de tests. El schema estático del DTO propio reside en `constants/tribe-lifecycle-result.ts` y no se valida ningún payload de proveedor ni fila de PostgreSQL como input. La consulta exacta bajo pausa reprodujo `42883` porque su overload era otra dependencia ausente del fixture; agregar `20261007004000_read_exact_own_admission_request.sql` hizo pasar la consulta real sin cambiar la expectativa.

La QA inicial de los cuatro manuales/índices termina con 16 renders y 28 recorridos Chromium/WebKit a 1280/390, cero errores y sin desbordes. Los tres manuales numerados modificados pasan el helper estático; sus advertencias indican documento local sin URL publicada y ausencia de catálogo central de traducciones. Se conservaron todos los scripts y capturas previos. La trazabilidad de código y la revisión final documental se consolidan después del commit de fuente. No se aplicó SQL ni se eliminaron tribus en producción, ni se acredita despliegue, scheduler, cleanup periódico o el resto de las matrices de ciclo de vida con este incremento.
