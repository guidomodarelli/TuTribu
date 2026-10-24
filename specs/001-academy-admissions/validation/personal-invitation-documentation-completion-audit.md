# Contraste documental de T131

Auditoría sobre `f1e74bcd`, con T130 cerrada. Se mantiene el criterio completo de nominativas e históricas, uso/vista únicos, evidencia/lista/vigencia, revocación/recuperación, owners e índices; el ensayo humano SC-014 pertenece a T207 y el rollout conserva sus gates.

La revisión identifica dos omisiones concretas: la arquitectura de referidos históricos no enlazaba ni distinguía el owner nominativo, y el owner/manual no explicitaban el máximo de una invitación utilizable no canjeada por destinatario y tribu. Se corrigen ambas en el mismo trabajo. Los controles reales Consultar estado actual, Ver más invitaciones y Reemitir sustentan la recuperación de una existente con versión/confirmación; se conserva destinatario/país y otro destinatario exige revocación/emisión nueva.

| Cláusula | Documento propietario |
| --- | --- |
| Histórico frente a nominativo y activación | referral-invitations.htm enlaza academy-admissions.htm y el manual temático; joining-options.html distingue el ingreso histórico anterior y la frontera protegida sin prometer migración automática. |
| Destinatario, evidencia y lista | Arquitectura y manual exigen cuenta estable, comprobación vigente y canje explícito; dispensa conserva revisión y no crea excepción de lista requerida. |
| Un canje y una vista | URL sólo al emitir, metadata sin token recuperable en historial/detalle/replay; abrir, login y verificar no canjean. |
| Unicidad, vigencia y cambio de restricciones | Una utilizable por destinatario/tribu, propuesta de siete días en UTC, otra fecha futura o advertencia independiente sin vencimiento; cambiar destinatario/lista/fecha requiere otro enlace, sólo el nombre se edita. |
| Revocación y recuperación | Revocar autorización pending cancela esa solicitud sin reciclar el enlace ni expulsar admitted; consulta original evita POST repetido y no reconstruye URL. |
| Owners, índices y changelog | academy-admissions.html y joining-options.html tienen sus recorridos; menú e índice detallado conservan referencias. Unreleased registra los cambios visibles sin afirmar entrega externa. |

Fuente comprobada con source-trace: no hubo cambios en los paths documentados entre `27d04837` y `f1e74bcd` antes de registrar owner/menú. La corrección mobile del documento histórico resuelve su min-content de tablas mediante overflow-wrap con fallback; no cambia reglas de cobro o atribución.

Validación: cuatro renders de referral, cuatro de arquitectura y cuatro del manual en Chromium/WebKit a 1280/390, sin errores/desbordes. Check-manual conserva 15 secciones/41 capturas/cero errores y dos avisos del documento local sin URL compartida/catálogo externo. El parser verifica 145 enlaces/anclas de cinco documentos sin roturas, y el QA real verifica menú/regreso/ancla/recarga. El rerun del mismo reviewer decide la cobertura final antes de marcar T131; no se acreditan T132, SC-014 humano ni rollout con esta documentación.

El rerun Codex termina con cero accionables y confirma criterio documental íntegro; siete hashes iniciales/finales estables, manifest `BA2C3D0A4107F15A25E90664EDC9BAA90058D7F0E221BAE019BCF5D3FAB46E2A`. Se marca únicamente T131, sin modificar criterios ni acreditar pruebas por el dictamen del reviewer. Conteo: 134 completadas y 78 pendientes, con los 212 IDs originales. T132, SC-014/T207 y rollout mantienen tareas propias.
