# FE-P8 — Brief de ejecución para Codex (QA final del frontend antes de congelar)

> Epic FE-POLISH — cierre de QA. Leer antes: `FE-POLISH_EPIC.md`, `WEB_INTERFACE_GUIDELINES.md`. Tokens de `src/design/`. Es una pasada de **calidad/robustez**, no de features nuevas.

## 0. Objetivo
Dejar el frontend robusto y prolijo antes de congelarlo para la integración con el modelo real: responsive, performance, estados de error/carga, y consistencia final.

## 1. Responsive (mobile / pantallas chicas)
Revisar y arreglar el layout en breakpoints chicos (probar ~360px, ~768px, ~1024px) en TODAS las vistas, con foco en las nuevas:
- Sidebar colapsable / nav en pantallas chicas.
- `AnalysisTimelineView`: el stepper y cada paso deben ser usables en móvil (no cortar contenido; upload, procesamiento, evaluación, aprobar).
- `StudyReviewView` (Case Review): las 3 columnas deben apilar bien en móvil sin romper visores/mediciones.
- Tablas (`WorklistTable`, `PatientsView`, longitudinal, mediciones): scroll horizontal o reflow correcto (ya hay `.table-wrap` enfocable).
- `ProfessionalSettingsView`, `HelpSupportView`, `PatientHistoryView`: legibles y usables en móvil.
- Verificar que no haya overflow horizontal de página ni elementos tapados.

## 2. Performance
- **Chunk de `three` > 500 kB:** configurar en `vite.config.ts` `build.chunkSizeWarningLimit` y/o `manualChunks` para separar `three` prolijamente (ya se carga lazy vía `import()`), y silenciar el warning de forma legítima (no ocultándolo, sino chunking correcto). Reportar tamaños de bundle antes/después.
- Verificar que el 3D y vistas pesadas sigan con carga diferida y no bloqueen el render inicial.
- Revisar re-renders evitables en paneles de revisión/timeline (memo donde aporte), sin cambiar lógica.

## 3. Estados de error y carga (consistencia)
- **Error de red / backend caído (`Failed to fetch`):** toda vista que consulta backend debe mostrar un estado de error humano + acción de reintento, no romperse ni quedar en blanco. Revisar Dashboard, Studies, Patients, History, timeline, Settings.
- **Estados de carga:** skeleton/spinner consistente (sin saltos de layout).
- **Estados vacíos:** consistentes y honestos (ya existen varios; unificar copy/estilo).
- Confirmar que los estados honestos de features Futuro (inferencia no real, sin histórico, 3D genérico, etc.) se ven bien y con copy claro.

## 4. Consistencia final
- Pasada de foco/teclado en flujos principales (navegación, abrir caso, editar medición, timeline).
- Consistencia visual: spacing, tipografía, uso de tokens, botones (variantes correctas), sin restos de estilos viejos.
- Confirmar que no quedaron imports/props/CSS muertos tras los tickets previos.

## 5. Reglas / alcance
- No features nuevas; no tocar contratos/backend/lógica de datos.
- Solo tokens; 0 hex nuevos; `!important` ausente o justificado.
- No romper flujos existentes.

## 6. Criterios de aceptación
- [ ] `npm run build` OK + `npm run lint` sin violaciones nuevas.
- [ ] Todas las vistas usables en móvil (sin overflow ni contenido tapado); reportar breakpoints probados.
- [ ] Warning de chunk de `three` resuelto por chunking correcto; tamaños reportados.
- [ ] Estados de error/carga/vacío consistentes y sin romper ante `Failed to fetch`.
- [ ] Sin código muerto residual; consistencia visual/tokens.
- [ ] Smoke test visual en móvil y desktop de las vistas clave.

## 7. Formato de devolución
```
### Revisión — FE-P8
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
Responsive: breakpoints probados; qué se arregló por vista
Performance: chunking de three; bundle antes→después
Estados error/carga/vacío: qué se unificó; comportamiento ante Failed to fetch
Consistencia/código muerto: qué se limpió
Smoke test (móvil + desktop):
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
