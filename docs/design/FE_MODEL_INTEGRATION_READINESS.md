# Readiness de integración Frontend ↔ Modelo IA

> Propósito: cuando el modelo IA se entrene (GCP) y se integre, el frontend ya tiene construidas las features "Futuro" en estados honestos deshabilitados. Este documento define, por cada una, **qué campo/contrato espera el frontend** para "encenderse". Es el checklist para integrar sin sorpresas. No define el backend/AI (eso es del chat técnico); define qué necesita el FE para consumirlo.

## Cómo leer esto
Cada bloque: **Feature Futura → qué muestra hoy (estado honesto) → qué campo/contrato espera → qué se enciende cuando llega.** Nombres de campos según lo que el FE ya lee en el código.

---

## 1. Inferencia real vs contrato (núcleo)
- **Hoy:** el timeline (`AnalysisTimelineView`) corre `runMultiplanarAnalysis({ allowContractFallback: false })` y **bloquea** la evaluación si el run no vuelve en modo real, mostrando "el modelo aún no tiene inferencia real disponible".
- **Espera del backend/modelo:**
  - `run.effectiveInferenceMode` = `"real"` o `"real_baseline"` (no `contract`/`fallback`).
  - Por plano: `run.planes.sagittal.effectiveInferenceMode` / `run.planes.axial.effectiveInferenceMode` = real.
  - Array de **mediciones reales** derivadas de la predicción (no placeholder).
- **Se enciende:** el paso 2→3 del timeline; la evaluación con mediciones reales; el flujo de aprobación sobre datos reales.

## 2. Coordenadas (AI-011)
- **Hoy:** `MriSliceViewer` deshabilita edición de landmarks si no hay `coordinateSpace`; muestra la limitación.
- **Espera:** `series.coordinateSpace` (o `landmark.coordinateSpace`) con el espacio real (`model_256` vs `original`) y el mapeo para convertir coordenadas.
- **Se enciende:** edición de landmarks (mover/agregar) sobre la imagen en el espacio correcto (FE-RD-004 ya construido).

## 3. Máscaras por clase (AI-017 / FE-007)
- **Hoy:** la visibilidad por clase está deshabilitada con tooltip "requiere máscaras por clase desde backend; hoy solo hay overlay.png combinado".
- **Espera:** assets de **máscara por clase** (vertebral_body, disc, spinal_canal, nerve_root, foramen/other) o una estructura de máscaras etiquetadas por clase, además del `overlay.png` combinado.
- **Se enciende:** toggles de visibilidad por clase en el visor; la leyenda ya está cableada a los `--mask-*` tokens.

## 4. W/L DICOM y multi-corte (AI-009)
- **Hoy:** visor opera sobre `input.png`/`overlay.png` (un solo corte); W/L es aproximación brillo/contraste sobre PNG 8-bit, documentado; slider multi-corte removido ("Single served PNG").
- **Espera:** series **DICOM reales** (múltiples cortes) + parámetros de windowing (window/level reales) + navegación de cortes.
- **Se enciende:** W/L radiológico real, navegación de cortes, y el visor deja de ser "single PNG".

## 5. Longitudinal por paciente
- **Hoy:** `PatientHistoryView` muestra timeline/trends/Key Measurements solo con dato real; si no hay histórico, estado vacío honesto ("requiere modelo longitudinal en backend"); provenance declara "no fabricated series".
- **Espera:** endpoint de historial de paciente que devuelva **múltiples estudios** (`patientHistoryResponse.studies[]`) con **métricas por estudio** y, para AI-vs-Reviewer en el tiempo, valores **AI-initial** y **Reviewer-final** almacenados por fecha/versión de modelo.
- **Se enciende:** trends (≥2 puntos reales), tabla Key Measurements AI-vs-Reviewer, Study Timeline con histórico real.

## 6. Persistencia versionada de correcciones (BE-007 / BE-008 / FE-010)
- **Hoy:** mediciones editadas se envían con `submitRunReview` a `/api/ai/runs/{multiplanarRunId}/review` usando `corrections` con snapshot `beforeValue`/`afterValue`; landmarks quedan como **borrador local no persistido** ("pendiente BE-008/FE-010"); versionado marcado pendiente en UI.
- **Espera:** endpoint/modelo de **persistencia versionada** para correcciones de mediciones y **landmarks** (guardar, versionar, historial AI↔Reviewer).
- **Se enciende:** persistencia real de landmarks, historial de versiones, "Reset to AI" contra el valor versionado.

## 7. 3D volumétrico paciente-específico (Modo B)
- **Hoy:** `SpineReconstructionPreview` muestra atlas **genérico** rotable etiquetado "no paciente-específico"; Modo B deshabilitado con `requiredInputs` reales del contrato.
- **Espera:** `threeD.enabled = true` + los inputs volumétricos: `sagittal_masks`, `axial_masks`, `spacing`, `slice_index_mapping` (pipeline volumétrico).
- **Se enciende:** reconstrucción 3D volumétrica real del paciente (reemplaza el atlas genérico en Modo B).

## 8. "Charlar con el modelo" (feature futura, conversacional)
- **Hoy:** no existe; mediciones/diagnósticos son editables por el revisor pero sin diálogo con la IA.
- **Espera:** endpoint de **IA conversacional** para discutir/desafiar salidas (mediciones y diagnósticos).
- **Se enciende:** UI de feedback conversacional (a diseñar cuando exista el endpoint).

---

## Regla de oro al integrar
Encender cada feature **solo cuando el dato real exista**, manteniendo el estado honesto como fallback. Nunca presentar contrato/mock/placeholder como real. El FE ya está construido con esa disciplina; la integración es "cambiar el gate de deshabilitado a habilitado cuando el campo real aparece".
