# HANDOFF — Chat dedicado al rediseño de frontend (revisión de devoluciones de Codex)

Propósito: este documento habilita a un chat SEPARADO (dentro de este mismo proyecto) a dedicarse 100% a revisar las devoluciones de Codex del epic FE-REDISEÑO, sin depender del historial del chat de planificación técnica. Copiá/enlazá este archivo al iniciar ese chat.

División de trabajo:
- Chat de planificación técnica (principal): backend/frontend/IA a nivel lógica, procesamiento, datos y seguridad (nuevos epics, contratos, persistencia, deploy, calidad).
- Chat de rediseño (este handoff): SOLO ejecutar y revisar las fases FE-RD-000..006 del rediseño visual del frontend.

---

## 1. Contexto del producto (mínimo necesario)
Plataforma web para radiólogos / centros / hospitales que asiste el análisis estructural de RM lumbar. NO diagnostica, NO reemplaza al profesional, revisión humana obligatoria, datos deidentificados. Es una web app alojada en la nube (no ejecutable). Tres repos: Frontend (React+Vite+TS), Backend (Spring Boot+PostgreSQL), AI Module (FastAPI+PyTorch).

## 2. Estado del frontend al iniciar el rediseño
- Los flujos E2E ya FUNCIONAN: seleccionar caso → subir RM → correr análisis real (real_baseline) → ver overlays/landmarks/mediciones → revisión profesional → persistido y auditado.
- La lógica está bien; el problema es DEUDA DE DISEÑO: se ve cargado e inconsistente. Hay 6+ CSS sueltos (theme.css, mri-theme.css, clinical-quiet.css, styles.css, worklist-table.css, visibility-controls.css, responsive.css).
- Componentes existentes (reestilizar, no reescribir): AppShell, Sidebar, Header, DashboardView, WorklistTable, MetricCard, StatusBadge, MultiplanarReviewView, MeasurementsPanel, MriSliceViewer, SpineReconstructionPreview, AgentSummary, AuditTrail, PatientHistoryView, DemoReadinessPanel, PrivacyBanner.
- Objetivo: elevar el frontend al nivel de las mockups en docs/design/.

## 3. Documentos de referencia (leer SIEMPRE antes de una fase)
- `docs/design/DESIGN_SPEC.md` — contrato de diseño (tokens, 3 pantallas, visores, 3D honesto, tabla de alcance).
- `docs/design/FE_REDESIGN_EPIC.md` — las 6 fases con su alcance.
- 3 mockups `.jpeg` en `docs/design/` — Dashboard, Patient longitudinal, Case Review. Al pasar una fase a Codex, indicarle que ABRA las mockups y lea el DESIGN_SPEC.

## 4. Fases y estado (actualizar a medida que se cierran)
| Fase | Ticket | Descripción | Estado |
|---|---|---|---|
| 0 | FE-RD-000 | Consolidar design system (tokens + unificar CSS + componentes base) | APROBADA (build 1831 OK; 7 CSS→src/design/*; 0 hex en CSS nuevo; !important 47→0). Pendiente ajuste: smoke test visual + completar 5 mask-tokens. |
| 1 | FE-RD-001 | App shell + Dashboard | EN CURSO (brief: FE-RD-001_BRIEF.md) |
| 2 | FE-RD-002 | Case Review (layout + paneles) | PENDIENTE |
| 3 | FE-RD-003 | Visores radiológicos 2D (W/L, zoom/pan, capas) | PENDIENTE |
| 4 | FE-RD-004 | Landmarks y mediciones editables | PENDIENTE |
| 5 | FE-RD-005 | Patient longitudinal (estados honestos) | PENDIENTE |
| 6 | FE-RD-006 | Vista 3D honesta (atlas genérico) | PENDIENTE |
Orden recomendado: 0 → 1 → 2 → 3 → 4; 5 en paralelo tras 0/1; 6 al final. Mayor impacto visual: 0, 1, 2.

## 5. Entorno del frontend (gotchas al revisar)
- Instalación: `npm ci --cache C:\npm-cache`. Si falla por EBUSY/EPERM (lock de OneDrive), fallback `npm install`. Codex debe reportar cuál usó.
- Verificación: `npm run build` (NO existe script `test`; el build es el chequeo de tipos). El baseline sano es ~1829-1830 módulos transformados.
- El repo vive bajo OneDrive → locks ocasionales en node_modules; no bloquea.
- No hay `AGENTS.md` en el repo frontend (Codex lo reporta como ausente; no bloquea; deuda M0-004b pendiente de commitear).

## 6. Cómo revisar cada devolución (checklist)
Al pegar el resultado de una fase, verificar:
1. `npm run build` OK (pedir la salida real).
2. NO rompe flujos existentes (carga → run → overlays → revisión siguen funcionando).
3. Usa tokens del design system, sin colores/estilos hardcodeados nuevos.
4. Coincide con la mockup en estructura/jerarquía/densidad (no cargado).
5. Honestidad respetada:
   - "Human review required", modo real_baseline vs contract/fallback visible, deidentificado.
   - Features "Futuro" (longitudinal/trends/coronal/edit-mask/3D volumétrico) con ESTADOS VACÍOS honestos, NO datos inventados.
   - 3D = atlas genérico etiquetado "no paciente-específico"; nunca fingir 3D derivado del paciente.
6. Alcance acotado a la fase (no hizo refactors globales ni tocó contratos).

## 7. Formato de revisión (usar este)
### Revisión
Fase / Ticket:
Resultado:
### Validación
- Qué está bien.
- Qué falta / qué podría estar mal.
### Decisión
aprobar / pedir ajuste / rehacer.
### Próxima fase recomendada
Fase + motivo.

## 8. Límites de honestidad (no negociables)
- No presentar 3D paciente-específico sin pipeline volumétrico (stack, spacing, orientación, máscaras 3D).
- No inventar datos longitudinales / trends / AI-vs-Reviewer (no existen en backend aún).
- No ocultar contract/fallback como si fuera real_baseline.
- No exponer paths internos ni datos identificables.

## 9. Qué NO se decide en este chat (va al chat de planificación técnica)
Modelo longitudinal en backend, ingesta DICOM real (AI-009), plano coronal, edición de máscara/recalculate, 3D volumétrico, deploy GCP, seguridad/auth, calidad del modelo (QUAL). Este chat solo ejecuta el rediseño VISUAL del frontend sobre lo que ya existe.
