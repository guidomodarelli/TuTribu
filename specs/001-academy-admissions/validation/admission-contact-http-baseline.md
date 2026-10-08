# Rutas nativas de código y prueba de admisión

El checkpoint 49ac330f2da043d43385381dde84b42a653f2181 está guardado y subido; el remoto coincide. Este incremento de T097/T102 conecta cuatro rutas de código y prueba. Mantiene las 212 tareas: 97 completas y 115 pendientes. No acredita la UI, los demás sources ni los gates externos.

Los entrypoints validan origen, params, query y body una vez antes de componer los owners nativos. La identidad, correo, propósito, conexión y sender permanecen server-side. Los DTOs propios conservan el original started/completed, contacto enmascarado, prueba opaca o versión incremental. No hay validación completa de respuestas PostgreSQL/proveedor ni mocks de autenticación, SDK o plataforma. La aplicación de prueba usa una composición DB-only; verificar un código no vuelve a despachar.

| Ensayo | Resultado y alcance |
| --- | --- |
| Local final | 70 casos en cinco suites, verdes en 2,43 s: guards HTTP, código, attachment, operación y recuperación. |
| 30535 | SQL de composición por defecto: verde en 126,57 s, con cleanup; el scope opcional de hosting de pruebas conserva el recorrido anterior. |
| 31002 | Next/auth/SQL/SDK: verde en 428,12 s, con cleanup. Emisión/replay, resend/replay, invalidación del anterior, fallo de código confirmado/recuperado y prueba aplicada a la misma pending con cuota cero y conexión suspendida. |
| 22253 | Next/auth/SQL/SDK: verde en 437,41 s, con cleanup. Agrega referencias uppercase de challenge/request/proof/operation, replay lowercase, ausencia de sesión 401 y sesión vencida 401. |
| 56964 | Guards HTTP y ledger/fingerprint reales: verde en 193,62 s, con cleanup. Uppercase first/lowercase replay de issue/verify/resend conserva dos despachos, dos desafíos/entregas, tres eventos —sólo un fallo— y tres operaciones. No crea prueba ni miembro. |
| 98712 | Build final Next 16.3.4 verde: compilación 11,6 s, TypeScript 4,5 s y 46 páginas. Incluye las cuatro rutas y los schemas finales. |
| Tipos y lint | Producto/tests verdes; lint focal sin advertencias y diff-check limpio. |
| QA documental | 96164: 44 renders en Chromium/WebKit a 1280/390, sin overflow/pageerrors, con navegación y hotspots existentes. Arquitectura final: cuatro renders verdes después de corregir documentación. |

Los ensayos nativos usan configuración sintética explícita en memoria, cifrado real y la misma configuración en fixture/Next. El SDK conserva versión, endpoints y deadlines. El preload cierra todo HTTP externo salvo las acciones, key, sender y destinatario previstos, y entrega el código al test sólo por IPC privado. No hubo mensajes externos ni pagador real. La emisión y el reenvío produjeron únicamente sus dos POST explícitos; verificar/aplicar no agregó envíos. Attachment conservó una auditoría y las fechas originales, sin aprobar ni crear membresía.

El TDD de handlers empezó rojo por módulo ausente. El ensayo 96223 terminó rojo en 221,17 s porque esperaba un reenvío todavía bloqueado después de transcurrido el cooldown. Se corrigió el fixture para leer clock/createdAt SQL y esperar sólo los 60 segundos reales restantes; no se alteraron límites ni timestamps productivos.

La revisión Codex inicial de 14 archivos encontró un P2 de UUID uppercase después del commit y un P3 documental. La regresión de aplicación reprodujo el error: una identidad válida podía aplicar efectos y luego devolver public_contract_unusable. Se normalizan request/proof/operation en el boundary y se comparan UUID de forma canónica. Dos regresiones adicionales detectaron challengeId uppercase en verify/resend; el boundary normaliza ese identificador antes del owner.

El rerun de 17 archivos encontró un P2 residual: operationId uppercase/lowercase del mismo UUID entraba con otro MAC en los tres namespaces. Tres regresiones HTTP fueron rojas y luego verdes con la normalización antes del ledger. Los comandos manuales conservan su contrato. El rerun final de 18 archivos cerró con cero hallazgos accionables, SHA inicial/final 26DB2F98738C03D8720D28F01709034D4AE502D75709B84D5EFF2E2DAD18B2EE y todos los hashes intactos.

Arquitectura y CHANGELOG acompañan el código. El manual interno y ambos índices documentan las operaciones sin inventar una pantalla: source-trace registra el checkpoint 49ac330f en 20/18/18 paths. Check-manual del manual interno y del índice detallado: cero errores; las dos advertencias corresponden a documentos locales sin URL publicada ni catálogo central de traducciones. Según user-guides/AGENTS.md, el menú temático se valida por enlaces, semántica y navegación en navegador, sin secciones numeradas ficticias.

El test 9759 de emisión para una pending sigue rojo y fuera de este checkpoint: es el siguiente incremento, con su propio reporte. No se salta ni se marca como completo. La UI, submit con prueba, invitaciones, recuperación comercial y los demás criterios de US5 conservan sus tareas.

El checkpoint documental pasó 36735: 12 renders finales en ambos motores y anchos, con commit de fuente verificado en DOM y navegación entre ambos índices y el manual. La revisión Codex de tres manuales cerró sin hallazgos; manifiesto inicial/final 0C365D419976393A2046BAD2831AD50C243A60C3DBD54634A2D482C870B6E8BF y tres hashes intactos.
