# Reingreso y reversión del owner de membresía

Incremento de T156/T159 sobre `e20afbb3`. Se mantienen las 212 tareas originales, 155 completas y 57 pendientes. Las pruebas nuevas ejercen las implementaciones actuales; no agregan controles al directorio ni cambian política, plazos o configuración desplegada.

## Canje personal y límite diario

`academy-membership-reentry.test.ts` emite una invitación con el owner nativo, presenta una pendiente real, la aprueba mediante el caso de uso de revisión y abandona mediante el owner de membresía. Comprueba que canje, versión, destinatario, fecha y binding permanezcan iguales. La aprobación conserva su historia, su fundamento queda aplicado pero revocado y la instancia de miembro desaparece.

Una presentación nueva inmediata, por token o vía común, conserva el rechazo por el límite diario. Recuperar la operación original devuelve su resultado histórico y no crea otro miembro. No se acredita como prueba independiente de política el rechazo producido antes de superar ese límite. Receipt `.git/codex-t156-personal-reentry-first-native.json`: exit0, un aprobado/cero omitidos, 151166 ms.

## Reversión completa y operación original

`academy-membership-rollback.test.ts` controla sólo el port propio de admisión: ejecuta el writer SQL real y luego provoca un fallo real de PostgreSQL con división por cero. Los snapshots posteriores comprueban la reversión conjunta de miembro, solicitud, fundamento, decisiones, auditoría, obligaciones y avisos locales. La consulta del original conserva started sin escribir.

La prueba observa el vencimiento real de la reserva de noventa segundos mediante reloj SQL; no altera fechas, sesión o reserva. Sólo después vuelve a enviar el mismo UUID e intent. El bloqueo cierra la pendiente una vez y la salida revoca el fundamento básico una vez; el replay no repite la salida. La primera corrida `.git/codex-t156-atomic-membership-rollback-native.json` termina exit0, un aprobado/cero omitidos, 272708 ms. La revisión detectó que su oráculo aceptaba un fallo técnico anterior al collaborator; por sí sola no acredita el punto exacto de rollback. Se refuerza el caso para capturar el estado SQL después de la reconciliación y exigir SQLSTATE 22012 en la causa privada: antes del fallo, el bloqueo ya había cancelado la pendiente y la salida ya había borrado el miembro y revocado su fundamento. La corrida posterior confirma esas precondiciones además de los snapshots intactos y del mismo envío recuperado: `.git/codex-t156-atomic-after-owner-native.json` termina exit0, un aprobado/cero omitidos, 264281 ms. Los dos errores contienen SQLSTATE 22012 y el UUID original; el estado dentro de la transacción acredita una pendiente ya cancelada y, para la salida, un miembro ya borrado y su fundamento ya revocado antes del fallo. No se mockean librerías de plataforma, ORM, SDK, autenticación o criptografía.

## Política actual después del plazo

El fixture inicializa al insertar un tenant, cuentas, sesiones y una pendiente histórica coherentes. PostgreSQL comprueba que cuenta y tribu precedan a la solicitud y que transcurrieron las veinticuatro horas; ninguna fecha guardada ni el reloj se modifica. El owner real aprueba esa pendiente, la cuenta sale y se revoca su fundamento.

Con la política cerrada, una presentación nueva falla y no hay miembro. Al reabrir, una versión anterior falla; la versión actual crea una pendiente distinta con snapshot de versión tres, sin crear membresía ni reutilizar la aprobación antigua. Se conserva el registro aprobado original y su fundamento aplicado/revocado. Receipt `.git/codex-t156-current-policy-contract-native.json`: exit0, un aprobado/cero omitidos, 115710 ms.

La preparación inicial omitía la función real de contexto de revisión; se incorporó su migración, sin cambiar producción. La primera expectativa de pausa usaba el código de decisiones. La implementación actual de presentación traduce la elegibilidad cerrada a admission_ineligible; se verificó el recorrido antes de alinear el oráculo. No se cuenta ninguna corrida de diagnóstico fallida como aprobada.

## Cierre y alcance abierto

La regresión de los consumidores existentes del fixture termina exit0, dos aprobados/un caso fuera del filtro en `.git/codex-t156-history-fixture-default-regression.json`: owner original, recuperación, fundamento básico y transferencia real. Tipos y lint pasan. El rerun del mismo reviewer termina sin hallazgos sobre siete paths, con manifiesto estable `D95F75F608B4101AAC91B9397D47459FDDF9710CBA68D854AED9AF1E5F5F2B4E`; esta actualización factual del receipt se contrasta como delta documental. La QA de los cuatro manuales termina exit0: 16 renders y 28 recorridos en Chromium/WebKit a 1280/390 px, sin errores ni desbordes. La comprobación estática no tiene errores; sólo advierte documento local sin URL publicada y ausencia de catálogo de traducciones. Los casos filtrados no se acreditan. El backend de producto sigue sin cambios. T156/T159 conservan los casos de moderación del fundamento, fuentes simultáneas, roles efectivos y pérdidas de configuración; T160 conserva el owner completo de salida de academia/eliminación, invalidación y archivo. T153 conserva sus seis AC y RG-01 a RG-04. Los gates operativos y la entrega externa mantienen sus requisitos originales.
