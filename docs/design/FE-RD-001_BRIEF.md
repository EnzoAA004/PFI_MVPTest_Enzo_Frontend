# FE-RD-001 — Brief de ejecución para Codex (App shell + Dashboard)

> Depende de FE-RD-000 (design system ya consolidado). Leer SIEMPRE antes: `DESIGN_SPEC.md` (§3 y §4.1), `WEB_INTERFACE_GUIDELINES.md`, y la mockup de **Dashboard** (`WhatsApp Image 2026-07-01 at 18.15.45.jpeg`). Usar los tokens/componentes base de `src/design/`. Reestilizar, no reescribir la lógica.

## 0. Objetivo
Nav lateral + header + Dashboard al nivel de la mockup de Dashboard, usando el design system de la Fase 0. Cero hex nuevos (solo tokens). No cambia contratos ni lógica de datos.

## 1. Estado actual (a reestilizar, componentes existentes)
- `Sidebar.tsx`: brand "LM", `side-nav` genérico, footer solo "Help & Support".
- `Header.tsx`: `top-header` con search y acciones (ya existe; también contiene generadores de reportes HTML export — NO tocar esa lógica).
- `DashboardView.tsx`: `page-heading` "Dashboard / Worklist", `metric-grid` (MetricCards), `dashboard-grid` → `worklist-panel` (con filtros) + `right-rail` (Vista previa segmentación con `mini-vertebra` **falsas**, Vista 3D, Actividad reciente).
- `WorklistTable.tsx`: tabla con sort, `model-state`, columna con botón "Abrir".
- `MetricCard.tsx`, `StatusBadge.tsx`, `PrivacyBanner.tsx` disponibles para reusar.

## 2. Entregable — Sidebar (DESIGN_SPEC §3)
- Logo/wordmark real: ícono de columna + "Lumbar MRI" / "Analysis Platform" (no "LM").
- Items: Dashboard, Studies, Review Queue (**con contador real**, no hardcodeado), Patients, History, Settings. Cada item con su ícono (lucide-react ya está).
- Item activo con el tratamiento de la mockup (fondo sutil, no el gradiente actual saturado).
- Footer: Help & Support + versión (`v1.3.x`) + punto de estado del sistema.
- Colapsable en pantallas chicas (breakpoints del spec).

## 3. Entregable — Header (DESIGN_SPEC §3)
- Búsqueda global con placeholder "Search studies, cases, or patients…" y atajo **⌘K** funcional (foco al buscador).
- Selector de modo "Academic / De-identified Data" (badge verde de escudo, como la mockup).
- Notificaciones (campana) y perfil ("Dr. <nombre> / Reviewer").
- Mantener intacta la lógica de export/reportes que ya vive en Header.tsx.

## 4. Entregable — Dashboard (DESIGN_SPEC §4.1)
### 4.1 Stat cards (fila de 4)
Pending Reviews (con "N high priority"), AI-Ready Studies, Model Status (Operational + link a diagnósticos), Flagged Cases. **Valores de datos reales** (contar sobre el dataset real, no los números de la mockup).
- ⚠️ **Honestidad — sparklines:** la mockup muestra un sparkline por card. Eso implica una **serie histórica de esos conteos que el backend NO provee**. NO inventar la serie. Opción por defecto: **omitir el sparkline** (card limpia) o, si hay dato real, mostrarlo; nunca dibujar una curva decorativa que parezca dato. Dejar esto como decisión marcada en la devolución.

### 4.2 Worklist (`WorklistTable`)
Columnas de la mockup: Case ID (link), Plane (con ícono por plano), Study Date, Model Status (chip: Complete/Processing/Failed/Queued), Review Status (chip: Pending Review/Reviewed/AI Processing/Error/Queued), Priority (High=danger / Medium=warning / Low=muted). Filtros + selector de vista ("All Studies"). **Paginación** ("Showing 1 to 8 of N"). Fila clickeable abre la revisión (ya funciona; mantener). Reemplazar la columna del botón "Abrir" por el patrón de la mockup (fila clickeable + Case ID como link).

### 4.3 Panel derecho (right-rail)
- **Latest Segmentation Preview:** usar el **asset real servido** por backend (overlay/input del último estudio) + leyenda L1–S1 + "AI Confidence NN%". ⚠️ Reemplazar las `mini-vertebra` falsas; si no hay asset real disponible, **estado vacío honesto** ("sin preview disponible"), no una columna dibujada a mano.
- **3D Lumbar Spine Preview:** placeholder honesto de la Fase 6 (atlas genérico etiquetado "no paciente-específico"). No fingir 3D del paciente. Puede ser un preview estático hasta la Fase 6.
- **Recent Activity:** feed real de actividad/auditoría (ya hay datos); si no, estado vacío honesto.

### 4.4 Footer
Banner Privacy & Data Use (reusar `PrivacyBanner`): deidentificado, HIPAA Safe Harbor, "Human review required. Not for clinical diagnosis."

## 5. Criterios de aceptación
- [ ] `npm run build` OK (reportar nº módulos).
- [ ] Sidebar/Header/Dashboard coinciden con la mockup en estructura, jerarquía y **densidad** (sobrio, no cargado).
- [ ] Solo tokens; 0 hex nuevos en CSS; `!important` ausente o justificado.
- [ ] Contadores y stat cards con **datos reales**, no números de la mockup.
- [ ] Ningún dato inventado: sparklines resueltos según §4.1; preview de segmentación real o vacío honesto; 3D honesto.
- [ ] Accesibilidad: foco visible, ⌘K por teclado, roles ARIA en tabla/tabs/nav, contraste AA; `npm run lint` (jsx-a11y) sin violaciones nuevas.
- [ ] Flujos intactos (abrir revisión desde la worklist sigue andando).
- [ ] **Smoke test visual** del Dashboard (screenshot o descripción de que las 3 secciones renderizan bien).

## 6. Fuera de alcance
Case Review (Fase 2), visores internos (Fase 3), edición (Fase 4), longitudinal (Fase 5), 3D real (Fase 6). No tocar contratos ni backend.

## 7. Formato de devolución
```
### Revisión — FE-RD-001
Instalación usada:
Build: <salida + nº módulos>
Sidebar/Header/Dashboard: qué cambió
Datos reales usados (contadores/stat cards): fuente
Decisión sparklines: omitido / con dato real (cuál)
Preview segmentación: asset real / estado vacío
a11y: violaciones nuevas (0 esperado)
Smoke test visual: resultado
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
