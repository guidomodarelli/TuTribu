# Contraste de validación integral de T143

El criterio original exige lifecycle, aislamiento A/B y transferencias con SQL/SDK real controlado, los seis AC, ausencia de bypass/otra key/cupo reseteado, preservación de históricos/invitaciones y errores con causa real privada. Restore operativo conserva su gate aparte. El código de producto sigue en `0bd9eb48`; T141 se cerró en `e1f72cb1` y el trabajo documental de T142 no modifica runtime.

## Matriz del criterio

| Escenario | Evidencia y propietario | Alcance que debe conservarse |
| --- | --- | --- |
| US-07-AC-01: candidata defectuosa y activa anterior | Auditoría completa T133/T134, preparación/activación SQL y contraste UI T136/T141; el container vigente conserva los casos de candidata inválida y caída del check con seleccionada previa. | Fallo de candidata no cambia seleccionada. No atribuir ese borde a la matriz Native de recuperación de avisos. |
| US-07-AC-02: reemplazo preparado y trabajos fijados | Writer de activación, SQL de respuesta tardía `98673` registrado en `messaging-isolation-and-rotation-baseline.md`; nueva validación A/B sobre `messaging-isolation-and-rotation.test.ts`. | Nuevas operaciones en versión seleccionada; receipt anterior mantiene intento/conexión/versión/reserva, sin abrir otra clave ni reiniciar cuotas. |
| US-07-AC-03: retiro coherente y suspensión inmediata | Auditoría T137: dependencias/política/pausa, writers sin SDK/SecretStore, rollback y recuperación original; tests actuales de lifecycle y contratos. | Suspensión de seguridad independiente del proveedor; no dispensa verificación ni garantiza retirar accepted/unknown. |
| US-07-AC-04: tribus intercaladas sin claves globales | SQL, Web Crypto, SecretStore, SDK oficial y transporte propio controlado en test nativo A/B; ambos receipts y reservas comparados con sus originales. Test focal de SDK ejerce dos claves/remitentes aun ante headers globales. | Cada tribu conserva su clave/remitente/contexto, sin fallback a otra tribu o pagador. |
| US-07-AC-05: credencial inválida o dependencia caída | SDK real con transporte controlado y HTTP 401/403/429/409/503; la respuesta propia omite mensajes privados y no realiza retries. Auditorías de diagnóstico y UI mantienen seleccionada/requisitos sin crear membresía de respaldo. | Distinguir causa técnica privada de feedback seguro; cualquier 409 no se presume aceptación. No se afirma caída real del servicio externo. |
| US-07-AC-06: cambio canónico de líder | Guarda SQL de cambio directo de rol/status, owner de transferencia y fences; auditoría T138 y nueva suite `admission-leadership-transfer.test.ts`. | Conexiones previas suspendidas, secretos no transferidos; miembros/invitaciones/históricos/consumo preservados. Nueva conexión propia y probada del líder actual. |
| Recovery y unknown relacionados | Auditorías T139/T140/T141: original/child/ledger/audit, plazo y consumo, incertidumbre sin otro POST, cuatro variantes UI únicas. | Sólo registro y consulta disponibles; despacho recuperado T185 y ensayo OG-04 conservan su alcance. |

Las suites específicas y sus propietarios reemplazan los nombres orientativos de archivo cuando ya existe composición concreta. No se crea un arnés artificial ni se lee el texto de fuentes como oráculo de tests. Las filas anteriores contrastan recorridos del producto y resultados observables, no equivalen por sí solas a marcar los seis AC como aprobación operativa completa.

## Ejecuciones actuales

- `.git/codex-t143-current-local-regression.json`: tres suites, 24 aprobados/cero fallos/cero omitidos, lifecycle contracts/browser client y owner de transferencia por puertos propios.
- `.git/codex-t143-current-sdk-error-and-dispatch.json`: dos suites, 27 aprobados/cero fallos/cero omitidos, SDK real/transporte propio, errores sanitizados, retries apagados y progreso de dispatcher. Estos archivos no se solapan con las tres suites anteriores.
- `.git/codex-t143-current-lifecycle-isolation-transfer.json`: tres suites originales, 16 aprobados/cero fallos/cero omitidos, exit 0 y cleanup terminal. Nueve casos ejercen application de lifecycle por puertos propios y siete PostgreSQL real: dos de aislamiento/revocación y cinco de transferencia. maxWorkers=1, sin paralelismo de archivos y como máximo dos ramas propias simultáneas.

Las ocho suites actuales reúnen 67 casos distintos: 60 locales/SDK y siete SQL. Las duraciones nativas son 110231,9442 ms para A/B intercalado, 42440,2097 ms para canal revocado después del fence y 24836,6753 / 24420,7279 / 46152,2538 / 46387,7761 / 78217,4031 ms para las cinco variantes estructurales de liderazgo. El primer caso confirma los markers antes del SDK y compara receipts y reservas consumed con cada entrega/versión original; el segundo deniega antes de leer secreto o invocar SDK. Las transferencias cubren rol/status bajo fence, muted/deleted con rollback y cambio directo con seleccionada/candidata anteriores suspendidas e históricos preservados.

La evidencia heredada de T133/T134/T135/T136/T137/T138 conserva sus fuentes y límites en las auditorías correspondientes. No se suma a esos 67 casos actuales para inflar el conteo y no se cuentan variantes filtradas como ejecución. Los tests usan biblioteca/SDK/plataforma reales y dobles sólo en puertos/transporte propios.

La fuente y los helpers importados permanecieron congelados durante la ejecución nativa y no se necesitó modificar producto o assertions. La revisión completa confirma los seis criterios y el receipt Native, con cero hallazgos accionables. Audit, trace y tres tests originales conservan el manifiesto estable `302868409AE4782EF96409C22951AB0F7D89D39A896CB287392155C0D86D03CC` antes de incorporar este recibo. El reviewer no ejecutó esas pruebas.

Se marca sólo T143: 151 completadas, 61 pendientes y 212 IDs/criterios originales intactos. Los casos controlados no acreditan servicio externo, restore, hosting, scheduler, despacho T185 u OG-04; esos gates y tareas conservan sus obligaciones. La ejecución independiente de membresías iniciada después de estos resultados no se atribuye a este cierre.
