# FE-RD-002 — Brief de ejecución para Codex (Case Review: layout + paneles)

> Depende de FE-RD-000/001. Leer SIEMPRE antes: `DESIGN_SPEC.md` (§4.3), `WEB_INTERFACE_GUIDELINES.md`, y la mockup de **Case Review** (`WhatsApp Image 2026-07-01 at 18.15.45 (esta es la del visor con las 3 columnas).jpeg` — la que muestra CASE-0142, visores Sagittal/Axial y panel de Measurements). Usar tokens/componentes de `src/design/`. **Reestilizar y reordenar, NO reescribir lógica.**

## 0. Objetivo
La pantalla de revisión al nivel de la mockup de Case Review: layout de 3 columnas, jerarquía y densidad correctas, paneles ordenados. **Sin tocar los visores internos (eso es Fase 3) ni la edición de landmarks/mediciones (Fase 4).**

## 1. Estado actual (a reestilizar)
La ruta `review` renderiza **`StudyReviewView.tsx`** (no `MultiplanarReviewView`, que parece legacy). Ya tiene:
- `review-grid` de 3 columnas: `left-column` (Case Info, Patient-Safe Metadata, Series Navigator), `center-column` (`workspace-tabs`, `opacity-control`, `SpineReconstructionPreview`, viewers, `legend-card`) y columna derecha con `MeasurementsPanel` / `AgentSummary` / `AuditTrail`.
- Usa clases `compact-card`/`compact-heading` (heredadas del viejo clinical-quiet, ya dentro de `components.css`).
Componentes a reusar: `StudyReviewView`, `MeasurementsPanel`, `AgentSummary`, `AuditTrail`, `SpineReconstructionPreview`, `MriSliceViewer`. Los reportes HTML export en `StudyReviewView.tsx` **NO se tocan**.

## 2. Entregable — Layout 3 columnas (DESIGN_SPEC §4.3)
### 2.1 Header de la pantalla
"← Back to Studies", **CASE-ID + badge de Review Status** (Pending Review, etc.), menú kebab de acciones. Search global + badge de modo + perfil arriba (ya vienen del shell de Fase 1).

### 2.2 Columna izquierda
- **Case Information:** Case ID, Study Date, Modality, Plane, Model Version, Review Status, Reviewer (con acción "Edit").
- **Patient-Safe Metadata:** Age (at study), Sex, Body Region, Study Description, Series Count, Image Resolution, "Show more". Todo deidentificado.
- **Series Navigator:** miniaturas por serie con estado seleccionado (la mockup muestra 7 series). Reusar los datos reales de series; si no hay thumbnails reales, placeholder neutro (no imagen falsa de RM).

### 2.3 Columna central
- Tabs **Sagittal / Axial / 3D Reconstruction**.
- **Toolbar:** Edit Mask, Add Landmark, Recalculate, Undo, Approve.
  - ⚠️ **Honestidad:** Edit Mask y Recalculate son features "Futuro" (§7 DESIGN_SPEC: pipeline de edición no existe). En esta fase van **presentes pero deshabilitados**, con tooltip honesto ("disponible en una fase futura"). No simular que funcionan. Add Landmark / edición de mediciones = Fase 4, también no-funcional aún.
- Marco/encuadre de los visores (Sagittal, Axial, panel 3D) con el header de cada visor (título, contador de cortes, toggle AI Overlay, W/L mostrado). **El comportamiento interno del visor NO se implementa acá** (W/L real, zoom/pan, capas = Fase 3). Solo el chrome/estructura al nivel de la mockup.
- **Segmentation Legend** (Vertebral Body, Intervertebral Disc, Spinal Canal, Nerve Root, Other Soft Tissue) usando los **mask-tokens** de `tokens.css`. Este es el momento de **cablear la leyenda a los 5 mask-tokens** (reemplazar el `style={{background: mask.color}}` con hex crudo por el token correspondiente). *(El cableado completo de las máscaras sobre el visor sigue siendo Fase 3; acá solo la leyenda.)*

### 2.4 Columna derecha
- **Measurements** (`MeasurementsPanel`): tabla Measurement / Value / Confidence / Outlier, con "Reset to AI". Confidence con semántica de color (verde ≥85 / ámbar 70-84 / rojo <70), Outlier=warning "Low". Valores con `tabular-nums`. **Solo restyle**; edición real = Fase 4.
- **Notes:** textarea.
- **AI Agent Summary** (`AgentSummary`): Findings + Impression + chips "Human review required" y "AI output may be inaccurate. Please verify all results." Diferenciar visualmente lo IA (`--ai`).
- **Audit Trail** (`AuditTrail`): feed real + "View full history".
- Acciones: **Save Draft** / **Approve & Complete**.

## 3. Honestidad (no negociable, §5/§8 DESIGN_SPEC)
- Modo de inferencia visible: `real_baseline` vs `contract/fallback` (el `MeasurementsPanel` ya muestra un estado; mantener/mejorar).
- "Human review required" siempre visible.
- IA vs Reviewer diferenciados.
- Features futuras (Edit Mask, Recalculate, edición) deshabilitadas y honestas, no fingidas.
- Metadata patient-safe, sin identificadores ni paths internos.

## 4. Criterios de aceptación
- [ ] `npm run build` OK (reportar nº módulos).
- [ ] Layout de 3 columnas coincide con la mockup en estructura, jerarquía y densidad.
- [ ] Leyenda de segmentación cableada a los 5 mask-tokens (0 hex crudo en la leyenda).
- [ ] Solo tokens; 0 hex nuevos en CSS; `!important` ausente o justificado.
- [ ] Toolbar presente; Edit Mask/Recalculate/edición deshabilitados y marcados como futuros (honesto).
- [ ] Flujo de revisión intacto (abrir caso → ver mediciones → Save Draft / Approve siguen funcionando).
- [ ] a11y: foco, roles ARIA en tabs/tabla/toolbar, contraste AA; `npm run lint` sin violaciones nuevas.
- [ ] Smoke test visual de Case Review (screenshot o descripción).

## 5. Fuera de alcance
Visores internos: W/L real, zoom/pan, visibilidad por clase sobre la imagen (Fase 3). Edición de landmarks/mediciones (Fase 4). Longitudinal (Fase 5). 3D real (Fase 6). No tocar contratos ni backend.

## 6. Formato de devolución
```
### Revisión — FE-RD-002
Instalación usada:
Build: <salida + nº módulos>
Layout 3 columnas: qué cambió por columna
Leyenda cableada a mask-tokens: sí/no
Toolbar futuras deshabilitadas: cómo se marcaron
Honestidad (modo inferencia / human review / IA vs reviewer): cómo quedó
a11y: violaciones nuevas (0 esperado)
Smoke test visual: resultado
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
