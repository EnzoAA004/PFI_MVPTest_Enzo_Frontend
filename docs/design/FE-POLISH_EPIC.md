# Epic FE-POLISH — Ajustes post-rediseño (feedback de Enzo sobre la app andando)

> Posterior al epic FE-REDISEÑO (fases 0–7, cerrado). Surge de una revisión de Enzo sobre la app deployed. Mismas reglas transversales: entorno `npm ci --cache C:\npm-cache` (o `npm install` si EPERM; reportar), verificación `npm run build` + `npm run lint`, solo tokens (0 hex nuevos), no romper flujos, Codex no toma decisiones de diseño solo (lista "Decisiones abiertas").

## Decisiones tomadas (Enzo)
1. **Compliance/avisos:** REMOVER todos los avisos de privacidad/governance/modo de la UI; el detalle va a **Help & Support**. (Se recomendó conservar un mínimo visible —"no diagnóstico clínico · revisión humana" + indicador de modo—; Enzo optó por removerlo todo. Registrado para trazabilidad. Mitigación: P5 gatea el análisis a estudios reales, reduciendo el riesgo de confundir output contrato/mock con real.)
2. **Settings:** pasa a configuración del profesional → **Perfil** (nombre, rol, matrícula, centro) + **Preferencias** (idioma, densidad, notificaciones) + **Cuenta/sesión** (contraseña, cerrar sesión).
3. **Carga de resonancia = timeline guiado de 4 pasos** (P5): 1) Cargar estudio (sagital/axial) → 2) Procesamiento (espera del modelo) → 3) Evaluación (mediciones + modelo 3D + preinforme generado) → 4) Aprobar o editar el reporte con feedback del profesional. El "Ejecutar análisis" solo se habilita con estudio real cargado (nada de mocks).
4. **Mediciones:** editables (se mantiene FE-RD-004). "Charlar/discutir con el modelo" (mediciones y diagnósticos) = **feature futura** dependiente de endpoint de IA conversacional → chat de planificación técnica.

## Tickets
| # | Ticket | Descripción | Estado |
|---|---|---|---|
| P1 | FE-P1 | Navegación + Header (fix tab activo, alineación, limpiar badges/⌘K/Run ID, campana/perfil) | APROBADA (ViewKey separado; sidebar highlight por item; StudiesView/PatientsView/Review Queue como pantallas propias; header limpio; perfil con menú+logout; empty honesto cuando demo; build 1836). Fix menor pendiente → P6: mantener origen iluminado al abrir un caso. |
| P2 | FE-P2 | Español total (i18n de toda la UI) + fix de encoding (mojibake) | APROBADA (texto visible en español ≈0 inglés; mojibake 0; 6 archivos muertos borrados + CSS huérfano limpio; build 1832). Requirió 2 pasadas. |
| P7 | FE-P7 | Pasada de accesibilidad (axe AA: contraste, roles, th vacío, scroll) | APROBADA Y CERRADA (axe runtime real vía @axe-core/playwright: 0 serious/critical en las 9 vistas; Dashboard 10→0, History 3→0, Case Review 3D 19→0; success/warning-strong a 7.1; script reutilizable scripts/axe-runtime-audit.mjs). |
| P8 | FE-P8 | QA final (responsive, performance chunk three, estados error/carga, consistencia) | PENDIENTE (brief: FE-P8_QA_BRIEF.md) |

## Documentos de readiness / hand-off (planificación de integración)
- `FE_MODEL_INTEGRATION_READINESS.md` — qué campo/contrato espera el FE por cada feature Futura para "encenderse".
- `TECH_CHAT_HANDOFF.md` — dependencias backend/AI/GCP consolidadas para el chat de planificación técnica.
| P3 | FE-P3 | Vista 3D (botones L1–S1 que colorean región, toggle detener rotación, estilo botones, centrado) | APROBADA (L1–S1 botones con highlight por emissive/token; rotación default quieta + toggle; controles con tokens; 3D + Recent Activity centrados; etiqueta honesta intacta; build 1832). Codex reportó violaciones axe baseline (color-contrast, aria-required-children, etc.) → deuda a11y. |
| P4 | FE-P4 | Case Review polish (alinear Measurements y Notas) | EN CURSO (brief: FE-P4_BRIEF.md) |
| P5 | FE-P5 | Carga de resonancia como timeline guiado + gating de análisis (nada de mocks) | PENDIENTE |
| P5 | FE-P5 | Carga de resonancia como timeline guiado + gating de análisis | APROBADA (AnalysisTimelineView 4 pasos; gating real; allowContractFallback:false + bloqueo honesto si no hay inferencia real; header "Nuevo análisis" sin run mock; MultiplanarWorkspaceCard fuera de Settings; build 1832). Decisión: artifacts parciales → bloquear todo (criterio formal al chat técnico). |
| P6 | FE-P6 | Limpieza Settings/Patients (remover paneles técnicos, mover compliance a Help & Support, Settings = perfil) | APROBADA (Settings = ProfessionalSettingsView + upload conservado; paneles técnicos desmontados; Patients sin governance; Help & Support vista real; persistencia honesta; build 1832). Deuda: borrar archivos muertos (AiMvpCompletionCard/DemoReadinessPanel/SystemDiagnosticsView/PipelineContractCard) en cleanup final. |

Orden sugerido: P1 → P6 → P5 → P3 → P4 → **P2 al final** (traducir después de mover/estructurar, para no rehacer). Nota: en P6 se conserva `MultiplanarWorkspaceCard` (upload real) hasta que P5 lo re-hogar en el timeline.

## Deuda registrada (para cleanup / ticket futuro)
- ~~Borrar archivos muertos~~ ✓ RESUELTO en P2 Parte A (6 archivos borrados: AiMvpCompletionCard, DemoReadinessPanel, SystemDiagnosticsView, PipelineContractCard, MultiplanarWorkspaceCard, MultiplanarReviewView).
- ~~Pasada de a11y~~ ✓ RESUELTO en FE-P7 (contraste AA, roles, th, scroll). **Pendiente sólo de entorno:** correr axe runtime con backend/sesión real para confirmar 0 violaciones (limitación de entorno, no de código).

## Dependencias para el chat técnico (no se resuelven acá)
- "Charlar con el modelo" (IA conversacional sobre mediciones/diagnósticos): endpoint nuevo.
- Estado real de procesamiento del modelo para el paso 2 del timeline (P5): si no hay señal real de progreso, usar estados honestos.
- Las ya conocidas: AI-009 (DICOM/multi-corte), AI-011 (coordenadas), AI-017/FE-007 (máscaras por clase), BE-007/008/FE-010 (persistencia versionada), pipeline 3D volumétrico, modelo longitudinal.
