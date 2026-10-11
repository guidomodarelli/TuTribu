# Límites cerrados y fundamentos simultáneos de membresía

Base `0da463d4`; evidencia de T156 sin cambios de producción. Se conserva el inventario de 157 completas/55 pendientes/212 hasta el cierre documental y la auditoría final de la tarea original.

## Matriz de configuración y recuperación

Una solicitud común se presenta por el owner real antes de cambiar la configuración. Un guardián existente se crea antes del marcador irreversible; no se infiere ni se asigna un privilegio como recuperación. Los cuatro escenarios ejercen presentación nueva, aprobación por líder y guardián, y el `join` anterior, además del estado real de request/actores/fundamentos.

| Estado actual | Presentación | Aprobación | Persistencia observada |
|---|---|---|---|
| Política ausente | `policy_conflict`, guard anterior a elegibilidad | `admission_ineligible` | Pendiente y actores intactos; ningún ingreso nuevo. |
| Settings ausentes | `admission_ineligible` | `request_conflict` sobre pendiente cerrada | Cancelación de sistema `academy_unavailable` única; fechas originales y actores intactos. |
| Admisión deshabilitada | `admission_ineligible` | `admission_ineligible` | Pendiente y actores intactos; ningún ingreso nuevo. |
| Recovery lock de hosting | `connection_incomplete`, rechazo previo al MAC | `connection_incomplete` | No cambia pending ni actores; ninguna autorización alternativa. |

En todas las filas, el writer anterior devuelve `admission_closed`, el marcador y la oferta pública siguen protegidos y no aparecen miembro, efecto de admisión ni solicitud nueva del otro solicitante. La pausa/flag no se confunde con el cierre definitivo provocado por DELETE de settings.

Los rojos iniciales eran expectativas de código: el guard de política ausente ocurre antes de elegibilidad, y recovery lock se rechaza antes del uso de claves. Se verificó cada recorrido actual antes de corregir el oráculo; no se cambió producción ni se aceptó un rechazo genérico.

## Matriz de fuentes simultáneas y moderación

El fixture ejecuta los owners reales de recuperación paga y facturación inactiva antes de la primera solicitud/canje. La membresía activa o silenciada existe antes del corte; la transición comercial registra su historia legítima. Después, emisión/canje/pending/aprobación reales consumen el fundamento básico de esa misma instancia, junto al receipt pago anterior.

Las cuatro combinaciones `active/muted × remove/block` comprueban ambos fundamentos realmente aplicados y no revocados antes de actuar. El owner de moderación conserva rol/fecha, revoca ambos y guarda su original. El replay no repite la acción. Otro pago autorizado no levanta la restricción administrativa o por conducta. El canje y binding quedan idénticos, el replay de presentación no crea miembro y el intento nuevo no permite reutilizar el token. La solicitud aprobada y su única decisión conservan su historia.

## Receipts y alcance

- `codex-t156-closed-boundaries-matrix-native.json`: tres filas aprobadas; el rojo de recovery lock se sustituye sólo por su ejecución corregida.
- `codex-t156-recovery-closed-correct-native.json`: recovery lock aprobado, tres casos fuera del filtro.
- `codex-t156-combined-source-first-native.json`: active/remove aprobado, tres fuera del filtro.
- `codex-t156-combined-source-other-cases-native.json`: las otras tres combinaciones aprobadas, una fuera del filtro.
- `codex-t156-default-role-compat-native.json`: caso de pago/canje con rol tribemate predeterminado aprobado, dos fuera del filtro.

Se acreditan ocho casos nuevos y una compatibilidad por sus scopes exactos; los filtros no se presentan como aprobados. La sesión de la matriz de configuración termina exit1 con tres filas aprobadas y el oráculo de recovery fallido; ese fallo no se presenta como aprobado. Su repetición corregida de recovery, los dos scopes de fuentes combinadas y la compatibilidad terminan exit0. Los recursos propios se cierran en cada scope. Typecheck de tests y lint pasan. El reviewer no tiene hallazgos en cuatro archivos, manifiesto `F13ED2D66EBD0DE0D675990720B3E08A00FE2DE8B65FC5C85E660CCC18E12F90`.

La salida/reingreso, canje consumido, política actual tras el límite diario y rollback posterior al owner están acreditados en `membership-reentry-rollback-baseline.md`. El owner de pago y su cierre indivisible están en `personal-paid-resolution-baseline.md`; salida de academia, borrado físico, archivo, entregas/códigos y ausencia de resurrección están en `tribe-scope-lifecycle-baseline.md`. Estos documentos conservan sus casos y límites; no se redefinen los criterios de T156 a esta matriz nueva.

La QA inicial de cuatro manuales/índices termina con 16 renders y 28 recorridos Chromium/WebKit a 1280/390, sin errores ni desbordes; scripts y capturas previos se conservan. La trazabilidad final y el cierre de T156 se registran después del commit de fuente. T153, SC-019 completo, preflight/rollout y los gates operativos mantienen sus requisitos separados; no se activó ni modificó producción.
