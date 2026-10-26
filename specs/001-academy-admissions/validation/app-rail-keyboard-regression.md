# Eventos de teclado sin tecla en el menú actual

Al integrar el menú lateral actual de main, la regresión anterior del Sidebar compartido quedó apuntando a un control y atajos que la aplicación ya no usa. La prueba ahora abre el App rail real con una sesión aislada y ejerce su atajo `[` en móvil y escritorio. En móvil, Escape cierra la hoja antes de comprobar el evento inválido.

El componente nuevo consultaba `KeyboardEvent.getModifierState` antes de descartar eventos sin tecla. La prueba con los contextos reales de Next reprodujo un `TypeError` después de comprobar que el atajo válido funcionaba. Se adelantó la guarda de tecla, Command y eventos ya atendidos; la lógica de AltGr y Ctrl permanece después de esa guarda.

Validación:

- Regresión inicial: un test fallido por el `TypeError` observado, con el listener real activo.
- Corrección: 18 tests correctos en tres archivos, incluidos los controles existentes del rail, la nueva regresión con contextos reales de Next y el evaluador de SC-014.
- Tipos de tests y lint: correctos.
- Build real de Next.js: correcto.
- UI autenticada real: cuatro de cuatro, Chromium y WebKit en móvil y escritorio, sin errores globales al emitir el evento inválido; el atajo y el botón siguen funcionando después.
- La rama Neon propia se eliminó y quedaron las tres ramas originales. La captura de trazas estuvo desactivada para conservar las credenciales sintéticas en memoria.

Comando del recorrido existente, con el entorno privado de prueba configurado:

```sh
node scripts/e2e/run-ui-tests.mjs --grep "current application rail shortcut" --trace off --workers 1
```

Este cierre verifica la regresión del menú; las validaciones globales de admisión y las capturas pendientes conservan su alcance.
