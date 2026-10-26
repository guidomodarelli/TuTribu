# Auditoría completa de la conservación de membresías

Fuente comprobada, commiteada y subida en `0abbc683`, sobre base `dd2a37dd`. T153 se cierra con sus seis AC y RG-01 a RG-04 íntegros: 159 completas/53 pendientes/212. El incremento actual añade pruebas sobre owners actuales, sin modificar producción, estructura de base de datos ni configuración desplegada.

## Criterios originales y evidencia

| Criterio original | Evidencia de su alcance |
|---|---|
| US-10-AC-01: active/muted, rol y fecha conservados al abrir enlace/activar | Política pura explícita y writers reales de membresía; `membership-lifecycle-coverage-baseline.md` y `membership-writer-baseline.md`. No se infiere una alta desde una mera lectura. |
| US-10-AC-02 / RG-03: conducta/remoción dominan pago y aprobación | Owners de T156 con revocación de ambas fuentes y pagos sin levantar moderación. La nueva `academy-restricted-pending-membership.test.ts` añade pending personal nacida por presentación real, remove/block del owner, aprobación del líder con CAS actual denegada y los tres owners de pago observados. Ambas variantes terminan aprobadas con cero omitidos. |
| US-10-AC-03 / RG-01: recuperación comercial básica conserva muted/rol/fecha | Los tres owners pagos actuales cuentan con recuperación desde snapshot conocido. La nueva `academy-free-membership-lifecycle.test.ts` consume decisión real sobre pending personal para recuperar gratuitamente la misma instancia silenciada; los tres entrypoints terminan aprobados con cero omitidos. |
| RG-02: fuente básica sobrevive antigua suscripción inactiva | La nueva prueba gratuita conserva su fundamento realmente consumido después de precio, diagnóstico y webhook con estado externo cancelado. Cada entrypoint exige DTO público observado y compara la persistencia y acceso real. No se acredita desde el fixture anterior con decisión sintética. |
| Beneficios, pagos y cursos no se restauran por admisión básica | La misma prueba gratuita conserva suscripción cancelada, grant revocado y matrícula histórica; el repositorio real permite curso membership y deniega academy. T154 conserva las matrices separadas de productos y derechos existentes. |
| Privileged/NULL no se inventan | Dominios explícitos, applier real y rechazo SQL de snapshot NULL, más nueve variantes pagas con resultado observado. No se presentan como nueve recorridos gratuitos completos; ver `membership-lifecycle-coverage-baseline.md`. La comprobación actual se registra por su propio terminal. |
| US-10-AC-04: histórico impersonal como common sin dispensa | T157/T155: lista/revisión y ON correo/teléfono, atribución, pendientes reales y UI/HTTP sin efectos antes de confirmar; `historical-common-admission-completion-audit.md` y `public-entry-completion-audit.md`. |
| US-10-AC-05: membresía legítima cancela pending sin fingir aprobación | T159: tres owners actuales, pendiente/canje personal reales y rollback posterior al owner; `personal-paid-resolution-baseline.md`. |
| US-10-AC-06 / RG-04: rollback/configuración ausente cierran admisiones | T156/T160: política/settings ausentes, flag apagado/recovery lock, marker independiente, retiro del scope y ausencia de resurrección; `membership-protected-boundaries-baseline.md` y `tribe-scope-lifecycle-baseline.md`. No reemplaza el ensayo completo de restore ni los gates de hosting. |

## Preparación, diagnóstico y ejecución

Los tests usan PostgreSQL en ramas propias con cleanup, cuentas/sesiones, criptografía, casos de uso, repositorios y SQL reales. Solo se controla el puerto externo de lectura del estado de pago; sus mutaciones fallan si se invocan. No se mockean ORM, auth, SDK, librerías internas o UI. No se alteran plazos de producto ni fechas de la pending.

La primera ejecución focal gratuita quedó roja antes de la aprobación por una consulta del test a `academy_admission_decisions.created_at`. El diagnóstico independiente con `pg.Client` sobre otra rama propia reprodujo SQLSTATE `42703` con una consulta `limit 0`; la metadata real acredita únicamente `decided_at` de tipo `timestamp with time zone`. Se corrigió esa consulta del test, sin modificar producto o schema. El diagnóstico termina exit0; el rojo original no se cuenta como aprobación. La primera ejecución de las dos variantes restringidas también quedó roja antes de moderación: consultaba `academy_admission_requests.created_at`. Otro diagnóstico directo con `pg.Client` reprodujo `42703` y confirmó `submitted_at` de tipo `timestamp with time zone`. Se corrigió solo esa consulta y la repetición de los dos casos completos termina exit0; el rojo no se acredita.

Tipos de tests y lint de los dos archivos nuevos pasan. La matriz gratuita termina exit0 con tres aprobados/cero omitidos (`codex-t153-free-current-full-native.json`); la comprobación actual termina exit0 con nueve Native de roles/NULL y once casos de dominio, veinte aprobados/cero omitidos (`codex-t153-current-privileged-domain-native.json`). Las dos variantes de pending restringida terminan exit0 con dos aprobados/cero omitidos (`codex-t153-current-restricted-pending-final-native.json`). No se suman filtros o casos omitidos al conteo de aprobados.

La revisión de requisitos sobre cinco tests focales originales no encontró una tercera brecha propia obligatoria; manifestó las dos incorporaciones necesarias y mantuvo su hash estable `C888CEF8DF6F0242EAC078FCF3543707CCEE32F8E2B7060E5884A08DECDE1581`. Eso acredita la auditoría de alcance, no los terminales de las pruebas nuevas.

La documentación propietaria y los manuales ya describen los comportamientos existentes; este incremento no agrega controles ni modifica flujos. Se conserva su trazabilidad previa y no se agrega una entrada de changelog por nuevas pruebas. T161, preflight/rollout, SC-019 completo y gates operativos permanecen separados y abiertos.

## Cierre verificado

Los cinco Native nuevos —tres recuperaciones gratuitas y dos variantes de moderación— pasan completos, junto con los nueve Native actuales de roles/NULL y once casos de dominio. Son catorce Native y once de dominio; no se suman diagnósticos, rojos anteriores, filtros ni baselines históricos al total actual. Cada workflow termina después del cleanup de sus recursos propios. Tipos de tests y lint actuales pasan. La revisión técnica de las dos fuentes tiene cero hallazgos accionables tras corregir las consultas, manifiesto estable `8FC5BE751E01AA62DE18DAFA04306C9E13EA78F160236169A5ACA108DA7A7C67`; esos hashes permanecen iguales al código ejecutado y commiteado.

La auditoría combina la evidencia actual con los baselines anteriores por sus contratos respectivos; no atribuye recorridos gratuitos completos a las pruebas negativas de roles ni un ensayo de restore a los rechazos de recovery lock. Solo T153 cambia de marcador. Los cuatro manuales conservan su SourceTrace y los diffs de sus paths no muestran cambios documentables; no se reescriben ni se recapturan flujos que este trabajo no modificó.
