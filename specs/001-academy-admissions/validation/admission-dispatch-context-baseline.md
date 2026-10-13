# Resolución privada y despacho focal del solicitante

Alcance: siguiente incremento de T100, sin cerrar la tarea ni conectar rutas/UI. El claim focal quedó guardado/subido enf31e7dd67295e08d75e54d3b3701727fe33ebc9e, remoto idéntico. El objetivo mantiene97/212 completas115 pendientes.

TDD del dispatcher rojo por módulo ausente; se crea ScopedAdmissionVerificationDispatcher con intención allowlisted de cuenta/sesión/tribu/desafío, resolver privado y factory de worker focal explícitos. Tres casos locales verdes verifican orden de resolución antes de factory, rechazo de account/challenge/tribe cruzados y propagación del fallo del resolver sin fabricar worker o retry. El authorize del worker consume seguridad actual y cierra recovery lock/cambio de entorno o época. Tipos del test se corrigen al port real, sin ampliar contratos productivos ni mocks de plataforma.

PostgresAdmissionVerificationDispatchContext revalida actor SQL y cuenta/sesión nativas, toma locks compartidos de tribu/usuario/sesión y consume el linaje propio challenge→delivery→conexión. La cuenta solicitante se distingue del contributor, que debe seguir siendo el líder canónico. Reconsulta autorización después de los locks antes de devolver sólo scope privado y entorno/época. No abre secreto, toma lease ni hace HTTP. Su SQL15658 está en curso: account/desafío cruzados y expiración de sesión deben cerrar antes de worker; no se acredita antes de exit.

46303 ejecuta el pipeline real de emisión del applicant, resolver, claim focal, marker/reserva, SecretStore/Web Crypto y SDK con transporte cerrado. Debe comprobar credential/sender/destino propios, SDK sólo fuera de SQL, una reserva consumed y otro trabajo intacto en cola. Las referencias de credencial/destino se comparan como booleanos para no volcar material en assertions. No produce prueba ni pertenencia por accepted. El resultado está pendiente y no representa un envío externo o pagador real.

Tipos de producto/tests, lint focal y diff-check pasan. La composición de request/trabajo en roots y la interfaz del solicitante mantienen su integración; callbacks obligatorios no equivalen a endpoints disponibles ni gates operativos.

15658 final verde81,35s, un SQL con cleanup: deriva exclusivamente el desafío del applicant real, devuelve contributor/recurso originales sin material y deniega actor/challenge cruzados y sesión vencida.32105 rerun agrega pérdida del rol canónico antes de resolver, sin usarlo como prueba de la suspensión estructural ya acreditada por US7; aún está en curso.

46303 pipeline final verde101,14s, un SQL/SDK real con cleanup: una emisión del applicant pasa por resolver, claim focal, marker/reserva, SecretStore y Web Crypto; el único POST SDK ocurre con0transacciones abiertas, usa credential/sender/destino propios y fallbackfalse. Accepted pertenece al intento original y una reserva consumed; el otro trabajo de la misma tribu permanece queued/sin lease/version1. No hay proof ni membership por transporte. Tres casos locales finales verdes399ms agregan cierre por recovery lock, entorno y época actuales; tipos/lint/diff-check permanecen verdes.

32105 final terminó verde84,76s con cleanup: además de cruces/sesión, perder el rol leader del contributor impide derivar el scope antes de crear worker. La guarda estructural de liderazgo conserva su evidencia propia de US7. QA documental final pasó cuatro renders Chromium/WebKit1280/390 sin overflow/pageerrors.

Review Codex7 estableA871DB988BE0CBFB70E8248DDE1EE6814E1E7FAD27F6E360C2D3DAC398EF7A06 cerró sin hallazgos accionables. Este bloque mantiene T100 y el recorrido público parciales: no hay factories de request/trabajo ni endpoints/UI conectados, y no cambia el conteo97/212 completas115 pendientes ni los gates externos.
