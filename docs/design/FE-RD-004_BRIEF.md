# FE-RD-004 — Brief de ejecución para Codex (Landmarks y mediciones editables)

> Depende de FE-RD-000..003. Leer SIEMPRE antes: `DESIGN_SPEC.md` (§4.3 y §5), `WEB_INTERFACE_GUIDELINES.md`, y la mockup de **Case Review**. Usar tokens/componentes de `src/design/`.

## 0. Objetivo
Edición tipo radiólogo: **landmarks editables (mover/agregar) sobre la imagen** y **mediciones editables con before/after, unidad, confidence y outlier, más "Reset to AI"**. La corrección del revisor debe distinguirse de la salida IA y persistirse por el contrato de revisión. Honestidad IA-vs-Reviewer en todo momento.

## 1. Estado actual (base ya existente)
- `MeasurementsPanel.tsx`: input editable básico (`updateValue → onMeasurementsChange`).
- `StudyReviewView.tsx`: ya hay estado de revisor (`reviewerValues`, `commitReviewerMeasurements`, `hasReviewerDrafts`, botones "Guardar medidas"/"Descartar", "Save Draft"/"Approve"). **"Reset to AI" hoy está `disabled`** (esta fase lo cablea).
- `MriSliceViewer.tsx`: landmarks reales (`StudyLandmark[]`, `onSelectLandmark`, `selectedLandmark`, prop `editMode`, `coordinateSpaceFrom`). Hoy los landmarks se **muestran y seleccionan**, NO se mueven ni se agregan.
- `App.tsx`: `handleSaveReview(status, notes)` y `handleMeasurementsChange` ya persisten la revisión (flujo E2E que YA funciona — no romperlo).

## 2. ⚠️ Dependencia backend (verificar y reportar primero)
La persistencia **versionada** de correcciones depende de **BE-007 (contrato de revisión), BE-008 (versionado) y FE-010**. Antes de asumir nada:
- Revisar `reviewPersistenceApi.ts` / `multiplanarApi.ts` para ver qué expone hoy el backend (¿guarda mediciones corregidas? ¿landmarks? ¿versiona?).
- Si **BE-008/FE-010 NO están**: implementar edición **local + envío dentro de la revisión existente** (el submit que ya funciona), y **marcar la persistencia versionada como PENDIENTE** en UI y en la devolución. **No inventar** endpoints ni fingir que versiona.
- Reportar exactamente qué persiste hoy y qué queda pendiente de backend (va al chat técnico).

## 3. Entregable — Mediciones editables
- Editar el valor del revisor por medición: **before/after visibles** (AI Initial vs Reviewer), con **unidad**, **confidence** y **outlier**. `tabular-nums`.
- **"Reset to AI"** funcional: restaura el valor IA original de esa medición (cablear el botón hoy deshabilitado).
- Diferenciar visualmente lo IA de lo corregido por el revisor (`--ai` para IA; el valor del revisor claramente marcado como edición).
- Delta AI↔Reviewer visible cuando hay corrección. Estado de "borrador sin guardar" claro hasta confirmar.
- Persistir vía el flujo de revisión existente (o versionado si BE-008 está). No romper `Save Draft`/`Approve`.

## 4. Entregable — Landmarks editables
- **Mover** landmarks (drag sobre la imagen) y **agregar** nuevos (Add Landmark, hoy deshabilitado → habilitar en `editMode`).
- Coordenadas en el **espacio correcto** (usar `coordinateSpaceFrom`; respetar model_256 vs original — AI-011). Si el espacio no viene del backend, no inventar la conversión: marcar la limitación.
- El landmark editado por el revisor se distingue del generado por IA.
- Los cambios de landmark entran en el mismo borrador/persistencia que las mediciones.

## 5. Honestidad (no negociable, §5/§8)
- **IA vs Reviewer siempre diferenciados** (valores y landmarks).
- Si la persistencia versionada no existe aún (BE-008), decirlo en UI ("corrección enviada en la revisión; versionado pendiente"), no fingir historial de versiones.
- No inventar confidence/outlier del valor corregido por el revisor (la confidence es de la IA; el valor del revisor no tiene "confidence" del modelo).
- No romper el flujo E2E existente (abrir → editar → guardar → auditado).
- 3D sigue atlas genérico (Fase 6); longitudinal es Fase 5.

## 6. Criterios de aceptación
- [ ] `npm run build` OK (nº módulos) + `npm run lint` sin violaciones nuevas.
- [ ] Se puede editar una medición y queda reflejada; "Reset to AI" restaura el valor IA.
- [ ] Se puede mover y agregar un landmark sobre la imagen; queda reflejado.
- [ ] IA vs Reviewer diferenciados en mediciones y landmarks.
- [ ] Persistencia: por el flujo existente; si BE-008/FE-010 no están, marcado PENDIENTE en UI + devolución (no fingido).
- [ ] Solo tokens; 0 hex nuevos; `!important` ausente o justificado.
- [ ] Flujo de revisión intacto (Save Draft / Approve / auditoría).
- [ ] Smoke test visual (editar medición + mover/agregar landmark).

## 7. Fuera de alcance
Longitudinal/trends (Fase 5), 3D volumétrico real (Fase 6), edición de máscara/recalculate (pipeline futuro), DICOM/multi-corte (AI-009). No tocar backend ni contratos (solo consumir lo que exista).

## 8. Formato de devolución
```
### Revisión — FE-RD-004
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
Backend hoy: qué persiste (mediciones/landmarks/versionado) — evidencia de reviewPersistenceApi/multiplanarApi
Mediciones editables: before/after, unidad, confidence, outlier; Reset to AI cableado
Landmarks editables: mover/agregar; espacio de coordenadas usado
IA vs Reviewer: cómo se diferencian
Persistencia versionada: existe / marcada PENDIENTE (cómo)
Dependencias para el chat técnico (BE-007/BE-008/FE-010/AI-011):
a11y: violaciones nuevas (0 esperado)
Smoke test visual:
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
