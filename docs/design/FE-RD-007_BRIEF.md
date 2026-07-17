# FE-RD-007 — Brief de ejecución para Codex (Limpieza de bloques legacy)

> Ticket de **deuda** posterior al epic FE-REDISEÑO (fases 0–6 aprobadas). Objetivo: quitar el JSX/CSS legacy duplicado que quedó **oculto** desde la Fase 2, sin cambiar comportamiento. Leer `WEB_INTERFACE_GUIDELINES.md`. Usar tokens/componentes de `src/design/`.

## 0. Objetivo
Eliminar los bloques legacy duplicados (hoy `hidden`) de `StudyReviewView.tsx` y el CSS que quedó huérfano, dejando solo los paneles nuevos ya aprobados. **Sin tocar** export/reportes ni la lógica de revisión.

## 1. Bloques legacy a eliminar (identificados en `StudyReviewView.tsx`)
Todos están envueltos con `hidden` y clases `legacy-*`:
- **`<div className="legacy-review-left" hidden>`** (~línea 590): contiene los paneles duplicados "Información del caso", "Salida módulo IA", "Trazabilidad de corrida", "Series", "Máscaras". Sus equivalentes nuevos y visibles son "Case Information", "Inference Mode", "Series Navigator" (más arriba). Eliminar el bloque legacy completo.
- **`<div className="toolbar compact-toolbar legacy-toolbar" hidden>`** (~línea 690): toolbar duplicada. La visible es la nueva. Eliminar.
- **`<section className="panel-card results-panel legacy-results-panel" hidden>`** (~línea 775): "Resultados IA y revisión" duplicado. Eliminar.
- **`<section className="panel-card notes-card compact-card legacy-notes-card" hidden>`** (~línea 822): "Notas y decisión" duplicado; el visible nuevo es "Notes". Eliminar.

## 2. Limpieza asociada
- Quitar estado/handlers/`panelId`s que queden usados **exclusivamente** por los bloques eliminados (ej. entradas de `hiddenPanels` para `case`, `ai-output`, `traceability`, `series`, `decision`, etc. que ya no se rendericen). Verificar que ningún panel visible dependa de ellos antes de borrar.
- Eliminar del CSS (`src/design/components.css`) las clases que queden **huérfanas** tras borrar el JSX (`legacy-review-left`, `legacy-toolbar`, `legacy-results-panel`, `legacy-notes-card`, y cualquier `compact-*`/selector que solo usaban esos bloques). Confirmar con grep que no se usan en ningún `.tsx` antes de borrar.

## 3. NO tocar (crítico)
- Los **generadores de reportes/HTML export** (las plantillas `<!doctype html>...` en `StudyReviewView.tsx`, `Header.tsx`, `PatientHistoryView.tsx`) — quedan igual.
- Los paneles nuevos visibles ni el **flujo de revisión** (abrir → editar mediciones → Save Draft / Approve → auditoría).
- Contratos, backend, ni otras pantallas.

## 4. Criterios de aceptación
- [ ] `npm run build` OK (~1834 módulos) + `npm run lint` sin violaciones nuevas.
- [ ] 0 bloques `legacy-*` / `hidden` duplicados restantes en `StudyReviewView.tsx` (grep `legacy-` debe dar ~0).
- [ ] CSS huérfano de esos bloques eliminado; confirmado por grep que no se referencia.
- [ ] Case Review renderiza **idéntico** a como quedó tras Fase 2–6 (sin cambios visibles).
- [ ] Flujo de revisión intacto; export/reportes intactos.
- [ ] Solo tokens; 0 hex nuevos; `!important` ausente o justificado.
- [ ] Smoke test visual (Case Review antes/después: sin diferencias funcionales).

## 5. Formato de devolución
```
### Revisión — FE-RD-007
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
Bloques legacy eliminados: cuáles (líneas/clases)
Estado/handlers/panelIds removidos:
CSS huérfano eliminado: clases
Export/reportes intactos: sí
Case Review sin cambios visibles: cómo se verificó
Smoke test visual:
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
