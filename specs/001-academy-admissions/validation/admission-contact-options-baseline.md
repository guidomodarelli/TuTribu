# Opciones de contacto en la lectura de ingreso

Incremento en curso de T103. Base guardada/subida: 0f47031424ed5833c0c554b0c696de90ae9acf32. Mantiene las 212 tareas, 97 completas y 115 pendientes; no crea una UI ni autoriza envíos.

El TDD de aplicación fue rojo por ausencia de verification en el resultado. El contrato propio incorpora sólo channel, allowedCountries y alternativa SMS explícita. Los guards quitan campos privados y rechazan incoherencia con el contacto de la política. Lecturas anónimas o con código OFF omiten opciones; no hay sender, conexión, credencial, cuota ni otra cuenta en la proyección.

| Ensayo | Resultado |
| --- | --- |
| 24830 | SQL rojo en 40,66 s: la lectura real todavía no componía las opciones. |
| 72025 | Dos SQL verdes en 47,59 s con cleanup: metadata runtime y overview existente. |
| 51884 | SQL rojo en 50,76 s: el rol sin bypass no podía leer las tablas privadas. |
| 10445 | Dos SQL verdes en 57,51 s con cleanup después de la proyección restringida; incluye la lectura anterior. |
| 27494 | SQL final verde en 63,87 s con cleanup: runtime/ordinary, anónimo, sesión ajena/vencida y rechazo 42501 de tablas privadas. Cero operaciones/códigos/entregas/eventos/pruebas/membresías. |
| Local | 58 casos en cuatro suites verdes en 1,70 s; tipos de producto/tests y lint pasan. |
| Arquitectura | Cuatro renders Chromium/WebKit1280/390 verdes, sin overflow/pageerrors. |

La migración versionada read_admission_contact_choices retiene locks compartidos de tribu, sesión, política y países; toma expiración con reloj SQL después de las esperas. No concede acceso directo a las tablas ni expone counters/referencias privadas. Messaging conserva el owner de países mediante readCountryChoicesForApplicant; el adapter de admisión copia esos hechos de display sin sustituir las restricciones de envío. La versión de política debe coincidir con el overview.

Estas opciones describen configuración; no garantizan canal preparado o disponible, ni reemplazan validación/quotas actuales al pedir un código. El GET no inicializa configuración ni muta efectos. Arquitectura, CHANGELOG y nota de disponibilidad están preparados; el source-trace del manual se actualizará al commit real. Build28471 final pasó Next16.3.4: compilación24,3s, TypeScript9,1s y46páginas. Revisión Codex del scope13 estable3D375A976EC49BADD90865153ADE378B86FA62BCCE75E25C144C7C28723B989D en curso. El source-trace del manual se registrará contra el commit del código antes del checkpoint documental.

Revisión Codex independiente final de trece archivos: cero hallazgos accionables; 3D375A976EC49BADD90865153ADE378B86FA62BCCE75E25C144C7C28723B989D estable y trece hashes intactos. La proyección no concede envío y conserva el owner único de países. El source-trace del manual se registra después de guardar el código para señalar un commit real; la UI permanece pendiente.
