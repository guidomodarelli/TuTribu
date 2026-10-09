# Rechazos confirmados de emisión y reenvío

Incremento correctivo sobre `10f7e8f59f415bbabf428c8dc5bfabcba7a1a06e`. Mantiene 97/212 tareas completas y 115 pendientes.

La prueba SQL real reprodujo que un rechazo por países devolvía un error conocido pero dejaba su operación en `started`. La expectativa de `completed` fue roja. Dos pruebas de consulta original y una del hook también fueron rojas: el DTO no reconocía una emisión rechazada y la UI conservaba incertidumbre.

El owner conserva ahora un snapshot propio de rechazo con propósito, discriminador y código cerrado. Un savepoint revierte el staging de emisión/presupuesto antes de completar sólo el ledger. Excepciones, cambios de seguridad y pérdidas de autoridad siguen el rollback exterior; no se presentan como rechazos confirmados. La respuesta de éxito mantiene el contrato de desafío existente.

El error privado lleva estado `completed` sólo después de commit/read del original. La aplicación comprueba su UUID, el mapper proyecta metadata genuina y GET original permite recuperar rechazo de emisión/reenvío. El hook limpia su referencia pendiente y muestra el catálogo seguro sin otro código o despacho. Un resultado histórico rechazado no se convierte en emisión si cambian después los países.

Validaciones realizadas:

- Primer caso SQL del fix: 54,55 s, verde y cleanup completo.
- Dos casos SQL finales: 116,34 s; rechazo por países permanece después de habilitarlos y límite de requests conserva sujetos/aliases y cinco eventos previos, sin nuevos efectos.
- Dos casos SMS regresivos: emisión/replay/validación local y ausencia de países pasaron con el nuevo writer, 117,40 s y 49,38 s. La corrida conjunta tuvo además una fixture incorrecta de límite; esos positivos no se confunden con una suite final completamente verde.
- Casos locales de contrato, recuperación, hook y HTTP: 69 verdes; tipos-tests y lint pasan.
- Build real: compilación 27,4 s, TypeScript 6,4 s, 46 páginas.

La fixture inicial del límite usó el cupo de envíos externos, que no limita pedir un código. Se corrigió a cinco requests previos según el contrato de presupuesto; no se cambió la regla productiva. El caso HTTP puro esperaba inicialmente 400, pero el mapper vigente usa 422 para país no permitido; se corrigió el oráculo y se conservó ese status. El helper de recuperación esperaba palabras ajenas al catálogo; se corrigió a país/teléfono sin alterar el copy del producto.

La prueba Next/Better Auth/SQL real pasó en 97,51 s y cerró todos sus recursos: POST 422 con original completed, replay 422 después de habilitar países y GET original 200 con rechazo inmutable. Cero requests al proveedor, efectos o membresías. La revisión de código sigue en curso. La arquitectura, CHANGELOG y manual propietario se actualizan en el mismo trabajo. Todavía no se acredita validación final ni se stagea este incremento como terminado.


La regresión conjunta final pasó 112 casos en 11 suites, 22,81 s; tipos-tests y lint sin errores. El arnés HTTP utiliza el mismo build productivo ya compilado y transporte externo cerrado.

La revisión final del código cerró con cero hallazgos y 15/15 hashes estables, manifiesto 6027C23597433F0300D9A049B5C3EDCB603796FB69DFF345E1A3524D82F70DAC. El manual pasó 24 renders Chromium/WebKit a 1280/390 px, con navegación y frames válidos; su fuente se actualizará tras guardar el código.
