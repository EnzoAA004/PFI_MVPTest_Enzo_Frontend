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
| P2 | FE-P2 | Español total (i18n de toda la UI) + fix de encoding (mojibake) | PENDIENTE |
| P3 | FE-P3 | Vista 3D (botones L1–S1 que colorean región, toggle detener rotación, estilo botones, centrado) | EN CURSO (brief: FE-P3_BRIEF.md) |
| P4 | FE-P4 | Case Review polish (alinear Measurements y Notas) | PENDIENTE |
| P5 | FE-P5 | Carga de resonancia como timeline guiado + gating de análisis (nada de mocks) | PENDIENTE |
| P5 | FE-P5 | Carga de resonancia como timeline guiado + gating de análisis | APROBADA (AnalysisTimelineView 4 pasos; gating real; allowContractFallback:false + bloqueo honesto si no hay inferencia real; header "Nuevo análisis" sin run mock; MultiplanarWorkspaceCard fuera de Settings; build 1832). Decisión: artifacts parciales → bloquear todo (criterio formal al chat técnico). |
| P6 | FE-P6 | Limpieza Settings/Patients (remover paneles técnicos, mover compliance a Help & Support, Settings = perfil) | APROBADA (Settings = ProfessionalSettingsView + upload conservado; paneles técnicos desmontados; Patients sin governance; Help & Support vista real; persistencia honesta; build 1832). Deuda: borrar archivos muertos (AiMvpCompletionCard/DemoReadinessPanel/SystemDiagnosticsView/PipelineContractCard) en cleanup final. |

Orden sugerido: P1 → P6 → P5 → P3 → P4 → **P2 al final** (traducir después de mover/estructurar, para no rehacer). Nota: en P6 se conserva `MultiplanarWorkspaceCard` (upload real) hasta que P5 lo re-hogar en el timeline.

## Dependencias para el chat técnico (no se resuelven acá)
- "Charlar con el modelo" (IA conversacional sobre mediciones/diagnósticos): endpoint nuevo.
- Estado real de procesamiento del modelo para el paso 2 del timeline (P5): si no hay señal real de progreso, usar estados honestos.
- Las ya conocidas: AI-009 (DICOM/multi-corte), AI-011 (coordenadas), AI-017/FE-007 (máscaras por clase), BE-007/008/FE-010 (persistencia versionada), pipeline 3D volumétrico, modelo longitudinal.
