# Epic FE-REDISEÑO — Elevar el frontend a nivel mockup (en fases)

Referencia obligatoria: `docs/design/DESIGN_SPEC.md` y las 3 mockups en `docs/design/`.
Regla transversal en todos los tickets:
- Entorno: `npm ci --cache C:\npm-cache` (o `npm install` si EBUSY/EPERM; reportar cuál). Verificación: `npm run build`.
- NO romper los flujos existentes (la lógica ya funciona: carga → run real → overlays → revisión). El rediseño es visual/estructural, no cambia contratos.
- Honestidad: mantener "Human review required", modo real_baseline vs contract/fallback visible, deidentificación, y estados vacíos honestos para features futuras (ver §7 del DESIGN_SPEC).
- Cada fase es un ticket chico; una fase por vez.

---

## Fase 0 — FE-RD-000: Consolidar design system
Objetivo: un único sistema de tokens + capas CSS, y componentes base reutilizables. Base de todo el rediseño.
Alcance:
- Crear `src/design/tokens.css` (colores, tipografía, espaciado, radios, sombras del DESIGN_SPEC §2) y unificar `theme.css`/`mri-theme.css`/`clinical-quiet.css`/`styles.css`/`worklist-table.css`/`visibility-controls.css`/`responsive.css` en una estructura base/components/utilities. Deprecar/eliminar los duplicados sin romper estilos.
- Componentes base: Card, Button (variantes), StatusBadge, ConfidenceBadge, PriorityTag, Tab, Table, FormField, Toggle, EmptyState, Toast. Todos leyendo tokens.
Aceptación: sin colores hardcodeados en componentes nuevos; `npm run build` OK; los flujos existentes siguen funcionando (revisión visual). 
Salida: archivos de tokens/componentes; lista de CSS unificados/eliminados.

## Fase 1 — FE-RD-001: App shell + Dashboard
Objetivo: nav lateral + header + Dashboard al nivel de la mockup de Dashboard.
Alcance:
- AppShell/Sidebar/Header según DESIGN_SPEC §3 (items, búsqueda ⌘K, selector de modo, perfil/rol).
- Dashboard §4.1: stat cards (Pending Reviews/AI-Ready/Model Status/Flagged), Worklist con chips de estado y priority, panel derecho (Latest Segmentation Preview, 3D preview honesto, Recent Activity), footer de privacidad.
- Reusar DashboardView/WorklistTable/MetricCard/StatusBadge existentes; reestilizar, no reescribir la lógica.
Aceptación: Dashboard coincide en estructura/jerarquía con la mockup; `npm run build` OK.

## Fase 2 — FE-RD-002: Case Review (layout + paneles)
Objetivo: la pantalla de revisión al nivel de la mockup de Case Review (sin tocar aún los visores internos, eso es Fase 3).
Alcance:
- Layout de 3 columnas §4.3: Case Information + Patient-Safe Metadata + Series Navigator (izq); tabs Sagittal/Axial/3D + toolbar (centro); Measurements + Notes + AI Agent Summary + Audit Trail (der).
- Reusar MultiplanarReviewView/MeasurementsPanel/AgentSummary/AuditTrail; reestilizar y reordenar según jerarquía de la mockup. Acciones Save Draft / Approve & Complete.
Aceptación: estructura y densidad como la mockup; flujo de revisión (FE-009) intacto; `npm run build` OK.

## Fase 3 — FE-RD-003: Visores radiológicos 2D
Objetivo: visores sagital/axial tipo radiólogo (DESIGN_SPEC §5).
Alcance:
- Window/Level (presets + drag), zoom/pan, fit; toggle overlay + opacidad; leyenda de segmentación con visibilidad por clase (incorpora FE-007).
- Operar sobre el asset servido por backend (input.png/overlay.png); documentar que W/L pleno con cortes reales depende de AI-009 (DICOM).
Aceptación: se puede ajustar W/L, zoom/pan, opacidad y visibilidad por clase; `npm run build` OK.

## Fase 4 — FE-RD-004: Landmarks y mediciones editables
Objetivo: edición tipo radiólogo (conecta con BE-008/FE-010).
Alcance:
- Landmarks editables (mover/agregar) sobre la imagen; mediciones editables con valor before/after, unidad, confidence y outlier; "Reset to AI".
- Persistir correcciones vía el contrato de revisión (BE-007) y el versionado (BE-008) cuando esté; hasta entonces, edición local + envío en la revisión.
Aceptación: se puede editar un landmark/medición y queda reflejado; `npm run build` OK. (Si BE-008 no está, marcar la persistencia completa como pendiente.)

## Fase 5 — FE-RD-005: Patient longitudinal (con estados honestos)
Objetivo: la vista de paciente al nivel de la mockup (DESIGN_SPEC §4.2), honesta sobre datos futuros.
Alcance:
- Header de paciente, tabs, Study Timeline, Trends Over Time (charts), Key Measurements AI-vs-Reviewer, Data Governance/Provenance/Export, Study Library.
- IMPORTANTE: la data longitudinal/trends/AI-vs-Reviewer NO existe hoy en backend. Implementar UI con estados vacíos honestos ("sin histórico disponible") y NO inventar datos. Documentar la dependencia backend (modelo longitudinal) como epic aparte.
Aceptación: la vista renderiza con datos reales donde existan y estados vacíos honestos donde no; `npm run build` OK.

## Fase 6 — FE-RD-006: Vista 3D honesta
Objetivo: tercer panel 3D sin fingir paciente-específico (DESIGN_SPEC §6).
Alcance:
- Modo A: modelo anatómico 3D genérico de columna lumbar (orientación/contexto), etiquetado "no paciente-específico".
- Cuando el 3D volumétrico paciente-específico esté deshabilitado, mostrar los requiredInputs faltantes (sagittal_masks, axial_masks, spacing, slice_index_mapping).
- Three.js permitido (ya disponible). No simular reconstrucción derivada del paciente.
Aceptación: panel 3D presente y honesto; `npm run build` OK.

---

## Orden sugerido y dependencias
0 → 1 → 2 → 3 → 4 (4 se beneficia de BE-008/FE-010). 5 puede ir en paralelo tras 0/1 (con estados vacíos). 6 al final o en paralelo tras 2.
Prioridad de impacto visual inmediato: Fases 0, 1 y 2 (design system + Dashboard + Case Review) son las que más "despresentan" el frontend con menos esfuerzo.

## Epics de backend/IA que habilitan lo "Futuro" (fuera de este epic de frontend)
- Modelo longitudinal por paciente (múltiples estudios, histórico de mediciones, AI-vs-Reviewer en el tiempo).
- Ingesta DICOM real + navegación de cortes + W/L pleno (AI-009).
- Plano coronal (nuevo pipeline IA).
- Edición de máscara + recalculate (pipeline de edición).
- 3D volumétrico paciente-específico (pipeline volumétrico: stack, spacing, orientación, máscaras 3D).
