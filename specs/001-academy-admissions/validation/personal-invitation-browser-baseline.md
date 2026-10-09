# Invitación nominativa — transporte y referencias de navegador

Incremento preparatorio de T129 sobre `55eda589`; no completa la página ni sus dependencias. La integración navegable y su matriz Chromium/WebKit siguen pendientes. No inicia escrituras al importar adapters, crear scope o restaurar referencias.

El puerto personal reutiliza viewer, submit y lectura de operación originales de admisión; añade preview propio y cierre de sesión nativo para el futuro cambio de cuenta. Preview valida token/proof y DTO propio, usa same-origin/no-store/no-referrer y mensajes del catálogo. Un fallo de transporte no retorna su causa. El submit conserva invitationToken únicamente en el body confirmado y el contrato existente de incertidumbre; no guarda el enlace en el ledger del navegador.

El hook de contacto acepta token efímero y scope personal separados. Sin scope bloquea emisión personal. Sus referencias quedan aisladas de common y de otros enlaces, sin OTP/token/destinatario/sesión/consentimiento. Cambiar scope cancela el transporte anterior e ignora su respuesta tardía. El SHA-256 real y separado por dominio produce la identidad no recuperable del enlace; no acredita autoridad ni sustituye la comprobación del servidor.

La intención durable de canje personal contiene únicamente viewer/slug/scope/operationId. No conserva proof, token, código o confirmación. Recuperación debe consultar el registry original; una referencia almacenada no acredita started ni completed. El container futuro no puede convertir la ausencia de resultado en éxito ni crear otro canje.

Validación: seis suites y 47 casos verdes en 4,89 s; dos suites SSR/preview con 24 casos verdes adicionales. SDK Better Auth, Zod, WebCrypto y sessionStorage reales; dobles solamente de HTTP y puertos propios. El fixture inicial de recuperación usaba `submit` en lugar del namespace canónico `submit_admission`; el schema rechazó el DTO, se corrigió el fixture sin cambiar el guard y las suites finales pasaron. Ambos chequeos de tipos y lint verdes. El build y revisión finales se registran antes del commit.

El rerun de revisión terminó con cero hallazgos accionables y 25 hashes estables, manifest `47E26E538F12DFFCD35588C6D8DBA22D051FDF9E0D373172E406A39C72E5F779`. CI completa exit 0: 444 suites/4.527 tests verdes en 660,79 s; 148 suites/472 gated se mantienen separados. Tipos/lint y build verdes sobre el snapshot congelado. La documentación completó 24 renders finales Chromium/WebKit 1280/390 sin errores. La lectura real de PostgreSQL pasó un caso en 109,92 s, sin inferir una página montada.

El schema estático de referencias de contacto se reubica después en constants con reexport compatible y sin cambio de contrato. Validación de ese delta: 47 casos/6 suites verdes en 10,77 s, tipos producto/tests y lint verdes, build 18,8 s/TypeScript 5,2 s/48 páginas en 1,866 s. La revisión focal concluye sin hallazgos con cinco hashes estables, manifest `493954FE9F890FD40E752041735D8FBB83BB4FD87D71C8F446EA0A96979762EC`. El registro terminal de la evidencia sólo actualiza ambos baselines; la CI anterior conserva su snapshot exacto.

Los manuales no anuncian una pantalla nueva ni requieren capturas de un recorrido que aún falta. El changelog de producto se actualizará cuando se conecte el flujo visible.
