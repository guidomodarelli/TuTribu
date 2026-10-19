# Google: evidencia de identidad y límite de la confirmación actual

T202 y OG-01 permanecen pendientes. Este análisis del 2026-10-18 distingue el comportamiento implementado de una confirmación que Google permita forzar. No acredita la matriz Gmail/Workspace/external ni el target Workers.

## Causa del recorrido que pide salir de Google

El árbol integrado `e381b383` pide `auth_time` firmado y un nonce propio para cada intención. La política sensible exige que esa autenticación tenga menos de diez minutos y esté ligada a la cuenta, sesión, tribu, operación y recurso actuales. El valor procede de `claims.auth_time`, nunca de la emisión del token o del callback. El proveedor nativo usa `prompt:consent`; volver a consentir no exige una nueva contraseña o llave de acceso.

La [documentación oficial de Security Bundle](https://developers.google.com/identity/siwg/security-bundle#authentication_time) establece que Google no admite que la aplicación solicite reautenticar la cuenta de Google. También distingue esa sesión de la que se establece al entrar a TuTribu. La [referencia OIDC](https://developers.google.com/identity/openid-connect/reference#authorization_endpoint) documenta `none`, `consent` y `select_account` para `prompt`; no documenta `login` ni `max_age` como una solución a este bloqueo.

Por eso un callback válido, con token nuevo, puede conservar la fecha anterior de ingreso a Google y no cumplir la política. No hay evidencia de que una caché de TuTribu explique ese comportamiento. Pedir salir de Google fue un workaround invasivo; no constituye una confirmación forzable dentro del producto. La interfaz y el manual todavía contienen esa indicación y necesitan corregirse junto con el recorrido elegido.

## Decisión de producto pendiente

Se presentó al usuario una elección concreta para evitar exigir la desconexión de Google:

- Confirmar de nuevo la cuenta mediante OAuth, conservando la sesión de Google. Debe validarse un callback nuevo ligado al intento y no se prometerá una nueva contraseña o huella. **Cambia la regla actual de recencia**; no puede presentarse como cumplimiento del `auth_time` de diez minutos.
- Exigir una prueba reciente mediante un autenticador propio de TuTribu. Requiere definir alta segura, recuperación y compatibilidad; no se incorpora un factor por inferencia ni se reutilizan los códigos BYOK de una tribu como seguridad global.

Hasta recibir esa decisión no se modifica la autoridad sensible, se reemplaza `auth_time` por `iat`, se amplía su ventana o se añade un factor. Las operaciones sensibles conservan su cierre y el login existente sigue disponible. No se vuelve a pedir al usuario que cierre su sesión de Google para suplir esta decisión de diseño.

## Trazabilidad de lo inspeccionado

- `src/modules/auth/constants/auth-evidence-capture.ts`: solicitud mínima de claims y nonce.
- `src/modules/auth/constants/better-auth-config.ts`: consentimiento del proveedor nativo.
- `src/modules/auth/infrastructure/better-auth/google-identity-evidence-plugin.ts`: intención autorizada, nonce y verificación mediante el proveedor original.
- `src/modules/auth/infrastructure/better-auth/google-id-token-evidence-verifier.ts`: fecha de autenticación derivada del claim firmado.
- `src/modules/auth/domain/policies/recent-authentication.ts`: ventana y scope actuales.
- `src/modules/auth/constants/reauthentication-ui.ts`: instrucción de salida que debe sustituirse junto con el flujo.
- `contracts/auth-evidence.md`, T011/T031/T032/T202, FR-032 y TC-013: contrato vigente. El cambio elegido debe conciliarse en spec, plan, contratos, arquitectura, manuales, pruebas y CHANGELOG antes de cerrarse.
