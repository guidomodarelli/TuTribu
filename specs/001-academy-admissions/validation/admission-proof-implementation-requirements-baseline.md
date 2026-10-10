# Aplicación backend de la prueba de contacto

T101 completada por su alcance backend sobre `cd122a29`, con T100 verificada. Se conservan las 212 tareas: 118 completadas y 94 pendientes. Este cierre acredita el owner de aplicación y su integración con submit; los recorridos por fuente, la interfaz y los gates mantienen sus tareas específicas.

| Cláusula de T101 | Implementación y evidencia terminal |
| --- | --- |
| Una aplicación en submit o en la misma pendiente | `SubmitAdmissionUseCase` y `ApplyAdmissionProofUseCase` derivan la identidad del servidor. Sus owners reutilizan el writer de prueba, consumen el ledger original y confirman request/proof/binding/audit juntos. Submit SQL pasó en 135,34 s; aplicación con recuperación de COMMIT perdido en 158,99 s; linaje y uso único en 40,46 s. Replay no aplica otra prueba ni crea otra solicitud. |
| Frescura máxima de quince minutos y época vigente | El writer bloquea el origen y la prueba, reautoriza el scope actual y compara el reloj SQL posterior a las esperas con `apply_before` original. La política pura y cinco casos SQL de aplicación cubren prueba fresca, vencida e invalidada. Las carreras reales de época y conexión pasaron en 175,39 y 160,55 s sin conservar autoridad anterior. |
| Contacto fijo o primera ausencia | El writer acepta el primer contacto ausente o mejora la evidencia del mismo contacto; rechaza sustitución, versión stale o un vínculo incompatible. Application SQL y los dos casos de teléfono SMS/WhatsApp comparan las filas finales y conservan el contacto original ante rechazo. |
| Reloj, actor y versión bajo lock | Autorización de cuenta/sesión/rol, ledger propio, request, desafío, proof y binding se revalidan en la transacción. El reloj es PostgreSQL y la escritura usa CAS de la versión observada. El recorrido HTTP de T097 pasó en 506,79 s, incluidos actor/recurso cruzados y adjunción propia. |
| Fechas originales y revisión posterior | La adjunción incrementa la versión y conserva `submittedAt` y `expiresAt`; las suites de aplicación, recuperación y teléfono comparan esos valores. El caso de elegibilidad acepta evidencia aplicada hace tres días y la revisión real consume esa evaluación; cambio de época o invalidación explícita vuelven a exigir evidencia vigente. No se renueva el plazo de la pendiente. |
| Conflicto de vínculo seguro | Reserva y vínculo se consultan bajo locks. Otro owner produce una denegación pública segura sin identidad ajena y conserva request/proof/binding. Las credenciales BYOK de la tribu no reasignan el vínculo ni recuperan la autenticación global del solicitante. |
| Integración de los archivos previstos | Los tres paths de T101 existen y están conectados: ambos casos de uso y `postgres-admission-request-repository` invocan los owners nativos. La aplicación no compone SDK, transporte o dispatcher y no aprueba ni crea membresía. |

Evidencia de apoyo:

- [contact-verification-persistence-requirements-baseline.md](contact-verification-persistence-requirements-baseline.md): persistencia, aplicación, submit, teléfono, linaje y carreras SQL terminales.
- [admission-proof-operation-baseline.md](admission-proof-operation-baseline.md), [admission-submit-proof-baseline.md](admission-submit-proof-baseline.md): implementación del owner original, recuperación y composición del submit.
- [contact-verification-routes-requirements-baseline.md](contact-verification-routes-requirements-baseline.md): recorrido HTTP real con autorización y contratos públicos.
- [admission-sms-pending-ui-baseline.md](admission-sms-pending-ui-baseline.md): cuatro variantes terminales Chromium/WebKit, a 1280/390 px, que adjuntan a la misma pendiente sin cambiar fechas, aprobar ni refrescar la ruta.

La auditoría independiente informó cero hallazgos accionables y ninguna brecha obligatoria de T101 sobre HEAD `cd122a29b5dd9b1e8f4e95d156ae2e9392412bd7`. Nueve fuentes principales permanecieron estables; agregado inicial/final calculado en memoria: `CC574D791FF621CED7FB49D8F289C97045B603213857651AAADF40F2140E1565`. No ejecutó pruebas nuevas ni modificó casillas. Los resultados citados tienen salida terminal; los agregados rojos y los casos filtrados conservan su alcance en las fuentes originales.
