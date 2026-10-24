# Integración backend del código y su despacho

T100 completada por su alcance backend sobre `8f07812c`, con T099 verificada. Se conservan las 212 tareas; el inventario pasa a 117 completadas y 95 pendientes. Este cierre no acredita UI, entrega productiva ni gates de US5, que conservan sus tareas.

| Cláusula de T100 | Implementación y evidencia terminal |
| --- | --- |
| Desafío, entrega, presupuesto y evento integrados | El issuer consume el presupuesto de pedido y crea su evento, desafío y outbox dentro de la transacción original; rechazos conocidos revierten staging antes de completar sólo el original. El pipeline SQL/SDK real conserva efectos y replay sin nueva emisión. |
| Dispatcher propio y RPC fuera de locks | `admission-verification-message-sender`, la factory de `createContactVerificationModule` y el root `src/modules/setup.ts` conectan el contexto privado al worker focal después del commit. Pipeline de correo verde en 113,61 s y SMS/WhatsApp en 292,22 s comprueban cero transacciones activas durante HTTP, credencial/remitente propios, fallback deshabilitado y replay sin otro POST. |
| Cuenta, tribu, contacto y propósito | El tuple del MAC/envelope liga cuenta, tribu, contacto y propósito; el resolver privado distingue al solicitante del líder contribuyente y sólo selecciona su challenge/delivery propios. El contexto Native verde en 84,76 s rechaza cruces antes de worker; T095/T097 conservan aislamiento real por cuenta/tribu y propósito admission distinto de diagnóstico. |
| Época de verificación, versión de conexión y época de seguridad | Issuer, resolver, preparación y autorización anterior al marker consumen recursos actuales y el mismo linaje inmutable. Las carreras y revalidaciones de T095/T096 comprueban cambios de política/conexión, sin otorgar acceso por una referencia conocida o por un secreto previamente preparado. |
| HMAC y envelope como máximo diez minutos | El MAC sólo sirve a la validación local y el envelope privado sólo al despacho, con keyrings/contextos separados. Crypto real rechaza scope/vigencia incorrectos o extensión; SQL de T095 comprobó TTL original exacto de 600.000 ms. Retirar material recuperable no valida ni renueva el código. |
| Pedir o verificar no canjea, vincula ni modifica auth global | El validador crea únicamente la proof local de admission; el vínculo se fija en submit/apply, no en issue/verify. Native conserva cero miembros, emailVerified falso, una sesión y ninguna captura global nueva. Pipeline y factory comprueban prueba local aislada de pertenencia y autenticación global. |
| Composición real y dependencia | Los tres archivos previstos existen y participan en la composición. La factory SQL pasó en 122,89 s; pipeline/replay en 119,80 s. T099 está completada y las rutas HTTP de T097 ejercitan esos owners reales, sin inferir disponibilidad de un tipo aislado. |

Fuentes de evidencia:

- [admission-focal-dispatch-baseline.md](admission-focal-dispatch-baseline.md), [admission-dispatch-context-baseline.md](admission-dispatch-context-baseline.md): claim y contexto focal autorizados.
- [admission-phone-dispatch-baseline.md](admission-phone-dispatch-baseline.md): SDK/SQL reales para SMS/WhatsApp, scope y ausencia de locks durante HTTP.
- [admission-verification-composition-baseline.md](admission-verification-composition-baseline.md): factory y root nativos, replay y prueba local.
- [verification-material-baseline.md](verification-material-baseline.md), [contact-verification-requirements-baseline.md](contact-verification-requirements-baseline.md), [contact-verification-persistence-requirements-baseline.md](contact-verification-persistence-requirements-baseline.md): crypto, TTL, aislamiento y carreras.
- [contact-verification-routes-requirements-baseline.md](contact-verification-routes-requirements-baseline.md): recorrido HTTP real conectado a los owners.

La auditoría independiente no encontró brechas obligatorias ni hallazgos accionables: dieciocho fuentes principales estables sobre `8f07812c573d64b11e99a8b6c56da83467741a84`, agregado inicial/final `10E3657F5951641893FA0892D181A86F01289C563C77E05B650C9B22CEA3F704`, calculado en memoria. No ejecutó pruebas nuevas ni cambió casillas. Los resultados citados son terminales y su alcance SQL/SDK/HTTP se distingue de una entrega externa paga. Las matrices de interfaz se reportan por separado y no sustituyen esta evidencia backend ni cierran la historia completa.
