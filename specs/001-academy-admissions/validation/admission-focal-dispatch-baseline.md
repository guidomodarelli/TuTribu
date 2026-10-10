# Claim focal de códigos del solicitante

Alcance: incremento de T100, sin cerrar esa tarea ni conectar endpoints/UI. El objetivo mantiene97/212 completas115 pendientes. El owner de emisión local quedó guardado/subido en0e04367e15f3e125d663b909cc80a52b374677b6, con remoto idéntico.

18723 rojo83,52s de setup: faltaba la función diagnóstica porque su migración no estaba en el fixture. Se aplica el artefacto real, sin alterar su protección.98861 rojo91,84s significativo: el claim diagnóstico real devuelve[] para una obligación admission aunque el desafío y contributor sean válidos. No se debe relajar ese propósito ni pasar la petición al barrido global.

Se agrega migración20261008210000_claim_scoped_admission_delivery.sql con helper privado sin grant público. Liga delivery/tribe/contributor/applicant/challenge/conexión/versión, propósito admission y origen del código actual; comprueba líder canónico y ausencia de marker antes de una lease. No abre material ni autoriza SDK. El marker y SecretStore siguen revalidando los permisos, cupos, estado, versión y época en su orden propio después del claim.

El scope focal distingue applicant del contributor y conserva la composición diagnóstica existente. buildMessagingWorkModule permite una sola opción de scope, cerrando una composición ambigua. El repo limita claim/authorize/complete/read y deniega reconciliación global desde un scope focal.24617 ejecuta el test admission y la regresión diagnóstica en SQL real; no se acreditan antes del exit. Tipos de producto/tests, lint focal y diff-check pasan.

El test exige que las referencias cruzadas de applicant/challenge/versión queden sin claim y que otro trabajo de la misma tribu permanezca queued/version1/sin lease. El dispatcher que deriva ese scope desde la cuenta y desafío confirmados, SDK/pipeline focal y roots permanecen pendientes en este bloque.

24617 terminó verde93,48s, dos SQL y cleanup: admission reclama únicamente el challenge del applicant correcto y la regresión diagnóstica conserva su comportamiento. Se extrae sólo la elección de primitiva a claimQuery para separar esa responsabilidad del checkout y evitar un ternario largo; valores, orden y propósitos se conservan. El rerun sobre ese helper final está en curso antes del checkpoint. QA documental pasó cuatro renders Chromium/WebKit1280/390; tipos/lint/diff-check finales pasan.

29943 final verde90,73s, admission y diagnóstico sobre claimQuery final con cleanup. Review Codex7 estableE176E90906E5F4EF03B608BA7806BFC6034E59DB7F4A0B49D2D083E0F4F81F86,0 hallazgos. Se amplía sólo el test admission para comprobar que el rol ordinario sin bypass recibe PostgreSQL42501 al ejecutar el helper privado;13645 focal está en curso, sin contar como verde antes de su exit. No se concede permiso nuevo al rol de prueba ni se inspeccionan strings del SQL como objetivo del test.

13645 final verde90,42s, un SQL con cleanup: además de los cruces y cola ajena intacta, el rol non-bypass recibe42501 y no toma lease, marker, intento ni reserva. El rol runtime conserva el claim exacto posterior. Tipos de tests, lint y diff-check pasan; el rerun del mismo reviewer comprueba la ampliación antes del checkpoint. T100 y sus integraciones mantienen su trabajo pendiente.
