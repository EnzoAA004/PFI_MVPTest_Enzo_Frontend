# FE-RD-006 — Brief de ejecución para Codex (Vista 3D honesta, atlas genérico)

> Fase final del epic. Depende de FE-RD-000..005. Leer SIEMPRE antes: `DESIGN_SPEC.md` (§6), `WEB_INTERFACE_GUIDELINES.md`, y la mockup de **Case Review** (panel 3D). Usar tokens/componentes de `src/design/`.

## 0. Objetivo
Panel 3D **honesto**: un modelo anatómico 3D **genérico** de columna lumbar para orientación/contexto, claramente etiquetado **"Representación anatómica de referencia — no paciente-específico"**. Nunca fingir un 3D derivado del paciente. Decisión tomada: **Three.js interactivo** (nueva dependencia).

## 1. Estado actual
- `SpineReconstructionPreview.tsx`: **SVG estático** con botones **Surface/Volume falsos** (no hacen nada real). Se usa en Dashboard (`DashboardView`) y en Case Review (`StudyReviewView`, tab "3D Reconstruction").
- **Three.js NO está en `package.json`** (hay que agregarlo).
- Backend expone estado 3D: `run.threeD?.status`, `contract?.threeD?.status` (`multiplanarRunTypes.ts` → `threeD`). Per §6: `threeD.enabled=false`, `requiredInputs=[sagittal_masks, axial_masks, spacing, slice_index_mapping]`.

## 2. Entregable — Modo A: atlas genérico interactivo (ahora)
- Agregar **`three`** como dependencia (npm). Reportar versión instalada.
- Reemplazar el SVG estático por un **modelo 3D genérico de columna lumbar** rotable (orbit/drag), para orientación/contexto. Puede ser:
  - geometría **procedural** (vértebras/discos apiladas L1–S1 con geometrías básicas), o
  - un **asset genérico** (modelo anatómico con licencia adecuada). ⚠️ Si se usa un asset, debe ser un **atlas genérico** con licencia libre/atribución correcta, **nunca** datos de un paciente. Reportar la fuente/licencia.
- **Etiqueta persistente** visible: "Representación anatómica de referencia — no paciente-específico".
- Quitar el toggle **"Volume"** falso: "Volume" implica rendering volumétrico del paciente (eso es Modo B, deshabilitado). Dejar solo interacción honesta del modelo genérico (rotar/zoom; "Surface" ok como vista del modelo genérico, sin prometer datos del paciente).
- Rendimiento: cargar el 3D de forma diferida (no bloquear el render de la pantalla). Respetar `prefers-reduced-motion` (sin auto-rotación agresiva).

## 3. Entregable — Modo B: volumétrico paciente-específico (deshabilitado, honesto)
- Mientras `threeD.enabled=false`: mostrar el panel de Modo B **deshabilitado** con los **`requiredInputs` faltantes reales** desde el contrato (`sagittal_masks`, `axial_masks`, `spacing`, `slice_index_mapping`) y el `status` real.
- Copy honesto: la reconstrucción 3D volumétrica paciente-específica **requiere pipeline volumétrico nuevo** (dependencia del chat técnico). No simular que existe.

## 4. Honestidad (no negociable, §6/§8)
- El modelo genérico **nunca** se presenta como derivado del paciente.
- Nada de "Volume"/reconstrucción que insinúe datos volumétricos del paciente.
- Modo B muestra los inputs reales faltantes; no fingir progreso ni resultado.
- 3D honesto tanto en Dashboard (preview) como en Case Review (tab 3D).

## 5. Dependencia backend/IA (reportar, no resolver acá)
**Pipeline 3D volumétrico paciente-específico** (stack, spacing, orientación, máscaras 3D) → chat de planificación técnica.

## 6. Criterios de aceptación
- [ ] `npm run build` OK (reportar nº módulos; **subirá** por incluir three) + `npm run lint` sin violaciones nuevas.
- [ ] `three` agregado a `package.json`; versión reportada.
- [ ] Modo A: atlas genérico 3D rotable, con etiqueta persistente "no paciente-específico"; sin toggle "Volume" engañoso.
- [ ] Modo B: deshabilitado, mostrando `requiredInputs` faltantes reales del contrato.
- [ ] Honesto en Dashboard y Case Review.
- [ ] Solo tokens; 0 hex nuevos en CSS; `!important` ausente o justificado.
- [ ] Carga diferida del 3D; `prefers-reduced-motion` respetado; a11y ok (canvas con texto alternativo/label).
- [ ] Flujos intactos; smoke test visual (rotar el modelo; ver Modo B deshabilitado).

## 7. Fuera de alcance
El pipeline volumétrico real (chat técnico). No tocar contratos ni backend.

## 8. Formato de devolución
```
### Revisión — FE-RD-006
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
three: versión instalada
Modo A: procedural o asset (fuente/licencia si asset); etiqueta "no paciente-específico" cómo/dónde
Toggle "Volume" engañoso: removido sí/no
Modo B deshabilitado: requiredInputs mostrados (cuáles, del contrato real)
Honesto en Dashboard + Case Review: sí/no
Carga diferida + reduced-motion + a11y del canvas:
Dependencia para el chat técnico (pipeline volumétrico):
a11y: violaciones nuevas (0 esperado)
Smoke test visual:
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
