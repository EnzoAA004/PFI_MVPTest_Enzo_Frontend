# DESIGN_SPEC — Lumbar MRI Analysis Platform (rediseño de frontend)

Base visual: las tres mockups en `docs/design/` (Case Review, Patient longitudinal, Dashboard). Este documento es el contrato de diseño para el rediseño. El objetivo es elevar el frontend existente al nivel de esas mockups: profesional, clínico, limpio y NO cargado, manteniendo el encuadre honesto (no diagnóstico, revisión humana obligatoria, datos deidentificados).

Producto: web app para radiólogos / centros / hospitales, alojada en la nube. No es un ejecutable.

---

## 1. Principios de diseño
1. Clínico y sobrio: densidad de información alta pero jerarquizada; espacio en blanco para respirar. Menos es más.
2. Una sola fuente de verdad visual: un design system con tokens, no CSS ad-hoc por componente.
3. Honestidad visible: siempre claros el modo de inferencia (real_baseline vs contract/fallback), la confianza, los outliers, y "Human review required".
4. AI vs Humano diferenciados: lo generado por IA y lo editado por el revisor deben distinguirse siempre.
5. Accesibilidad: contraste AA, foco visible, navegación por teclado, tabular numerals en mediciones.

## 2. Design system (tokens)

### Color
| Token | Uso | Valor sugerido |
|---|---|---|
| `--bg-app` | Fondo de contenido | #F7F8FA |
| `--bg-sidebar` | Nav lateral | #0E1726 (slate-950) |
| `--surface` | Cards | #FFFFFF |
| `--border` | Bordes sutiles | #E5E7EB |
| `--text` | Texto principal | #0F172A |
| `--text-muted` | Secundario | #64748B |
| `--primary` | Acción principal / links | #2563EB |
| `--ai` | Acento IA (model status, overlays) | #7C3AED |
| `--success` | Complete / de-identified / OK | #16A34A |
| `--warning` | Medium / outlier / degradado | #F59E0B |
| `--danger` | High / Failed / Error | #DC2626 |
| `--info-bg` | Banners informativos | #EFF4FF |

Semántica de badges de confianza: verde ≥85%, ámbar 70–84%, rojo <70%. Outlier flag = ámbar "Low". Priority: High=rojo, Medium=ámbar, Low=gris.

### Tipografía
- Familia: Inter (o system-ui fallback). 
- Escala: H1 24/600, H2 18/600, H3 15/600, body 14/400-500, small 12–13/500, mono-tabular para valores de medición.
- Números de medición con `font-variant-numeric: tabular-nums`.

### Espaciado y forma
- Escala base 4px: 4/8/12/16/24/32/48.
- Padding de card: 16–24. Gap de grilla: 16–24.
- Radios: card 12, chip/badge 6–999 (pill), botón 8, input 8.
- Elevación: sombra suave `0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)`; evitar sombras pesadas.

### Componentes base (unificar, no duplicar)
Card, Button (primary/secondary/ghost/danger), StatusBadge, ConfidenceBadge, PriorityTag, Tab, Table (denso, zebra sutil), FormField (label+input+error), Toggle, Tooltip, EmptyState, Toast. Todos leen tokens; nada de colores hardcodeados por componente.

### Consolidación de CSS (deuda actual)
Unificar `theme.css`, `mri-theme.css`, `clinical-quiet.css`, `styles.css`, `worklist-table.css`, `visibility-controls.css`, `responsive.css` en un único sistema de tokens + capas (base / components / utilities). Es el primer paso del rediseño.

## 3. Layout / App shell
- Sidebar oscuro fijo: logo "Lumbar MRI — Analysis Platform", items: Dashboard, Studies, Review Queue (con contador), Patients, History, Settings; footer con Help & Support y versión + estado.
- Header: búsqueda global ("Search studies, cases, or patients…" con ⌘K), selector de modo "Academic / De-identified Data", notificaciones, perfil (Dr. + rol).
- Contenido: grilla responsive; en desktop multi-columna, en pantallas chicas apilado.

## 4. Pantallas núcleo

### 4.1 Dashboard (`DashboardView`)
- Fila de stat cards: Pending Reviews (con "high priority"), AI-Ready Studies, Model Status (Operational + link), Flagged Cases. Cada una con sparkline sutil.
- Worklist (`WorklistTable`): columnas Case ID, Plane (icono), Study Date, Model Status (chip: Complete/Processing/Failed/Queued), Review Status (chip: Pending Review/Reviewed/AI Processing/Error), Priority. Filtros + selector de vista. Paginación.
- Panel derecho: Latest Segmentation Preview (con leyenda L1–S1), 3D Lumbar Spine Preview (ver §6, honesto), Recent Activity (feed).
- Footer: Privacy & Data Use (deidentificado, HIPAA Safe Harbor, "Human review required. Not for clinical diagnosis").

### 4.2 Patient longitudinal (`PatientHistoryView`)
- Header de paciente deidentificado (PAT-xxxx, De-identified badge, Sex/Age unknown, Total Studies, First/Most Recent). Acciones Export Summary / Add Study.
- Tabs: Longitudinal Overview, Study Repository, Activity & Audit, Data Governance.
- Study Timeline (lista de estudios con modelos vX y estado de review).
- Trends Over Time: charts (Lordosis Angle, Central Canal Diameter, Avg Disc Height) con series "AI (Initial)" punteada vs "Reviewer (Final)" sólida.
- Key Measurements (AI vs Reviewer): tabla por fecha/versión de modelo, mostrando AI y Reviewer lado a lado.
- Paneles: Data Governance & Privacy, Data Provenance & Audit, Export & Sharing Restrictions (raw images / full reports / per-patient export = Not permitted; derived visuals = Permitted), Study Library (datasets públicos deidentificados).
- NOTA DE HONESTIDAD: la vista longitudinal, trends y AI-vs-Reviewer requieren datos que hoy el backend NO agrega (múltiples estudios por paciente, histórico de mediciones). Implementar la UI con estados vacíos honestos y marcar los datos futuros; ver dependencias en §7.

### 4.3 Case Review (`MultiplanarReviewView` / `StudyReviewView`)
- Columna izquierda: Case Information (Case ID, Study Date, Modality, Plane, Model Version, Review Status, Reviewer), Patient-Safe Metadata (Age/Sex/Body Region/Description/Series/Resolution), Series Navigator (miniaturas por serie).
- Centro: tabs Sagittal / Axial / 3D Reconstruction. Toolbar: Edit Mask, Add Landmark, Recalculate, Undo, Approve. Visores con AI Overlay toggle y W/L (ver §5). Paneles sagital y axial con overlays, landmarks y líneas de medición, leyenda de segmentación (Vertebral Body, Intervertebral Disc, Spinal Canal, Nerve Root, Other Soft Tissue).
- Columna derecha: Measurements (tabla Measurement / Value / Confidence / Outlier, con "Reset to AI"), Notes, AI Agent Summary (Findings + Impression + "Human review required" + "AI output may be inaccurate"), Audit Trail. Acciones Save Draft / Approve & Complete.

## 5. Visores radiológicos 2D (sagital + axial)
Objetivo: visor enfocado tipo radiólogo (no paridad con 3D Slicer, que es una app de escritorio madura). Capacidades:
- Window/Level (W/L) con presets y ajuste por drag; zoom/pan; fit.
- Toggle de overlay AI + control de opacidad (ya existe opacidad).
- Leyenda de segmentación por clase con color; visibilidad por clase (FE-007).
- Landmarks: marcadores por centroide, editables (mover/agregar) — conecta con edición de mediciones.
- Mediciones: líneas/valores sobre la imagen + tabla lateral, con confidence y outlier; editables (before/after) — conecta con BE-008/FE-010.
- Espacio de coordenadas visible (model_256 vs original) — conecta con AI-011.
Nota: W/L "real" con series completas y navegación de cortes requiere ingesta DICOM real (AI-009); hasta entonces, opera sobre el asset servido (input.png) y se documenta la limitación.

## 6. Vista 3D (honesta)
Regla del backlog: NO presentar 3D paciente-específico sin stack completo, spacing, orientación y máscaras volumétricas. Estado actual: modelos 2D de un solo corte; `multiplanar_run.threeD.enabled=false`, `requiredInputs=[sagittal_masks, axial_masks, spacing, slice_index_mapping]`.
- Modo A (ahora, honesto): modelo anatómico 3D GENÉRICO de la columna lumbar para orientación/contexto, claramente etiquetado "Representación anatómica de referencia — no paciente-específico".
- Modo B (epic futuro): reconstrucción 3D volumétrica paciente-específica (requiere pipeline volumétrico nuevo). Mientras esté deshabilitado, el panel muestra los `requiredInputs` faltantes.
Nunca mostrar un 3D que parezca derivado del paciente si no lo es.

## 7. Qué es visual-ahora vs implica nuevo backend/IA (honestidad de alcance)
| Elemento de la mockup | Estado | Depende de |
|---|---|---|
| Design system + 3 pantallas (layout) | Visual ahora | — |
| Visores 2D con W/L básico sobre asset | Visual ahora | — |
| Landmarks/mediciones editables | Front + contrato | BE-008 / FE-010 |
| Visibilidad de capas por clase | Visual ahora | FE-007 / AI-017 |
| W/L real con navegación de cortes | Futuro | AI-009 (DICOM real) |
| Plano coronal | Futuro | nuevo pipeline IA |
| Edit Mask / Recalculate | Futuro | pipeline de edición de máscara |
| Vista longitudinal / trends / AI-vs-Reviewer | Futuro | modelo longitudinal en backend |
| 3D volumétrico paciente-específico | Futuro | pipeline 3D volumétrico |
Los elementos "Futuro" se implementan en la UI con estados vacíos honestos hasta que exista el dato.

## 8. Accesibilidad y responsive
- Contraste AA, foco visible, roles ARIA en tabs/tablas/toggles, navegación por teclado (incluida búsqueda ⌘K).
- Breakpoints: viewers lado a lado en ≥1280px; apilado debajo. Sidebar colapsable en pantallas chicas.
