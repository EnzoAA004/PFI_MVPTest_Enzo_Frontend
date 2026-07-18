# FE-P2 — Brief de ejecución para Codex (Español total + fix de encoding)

> Epic FE-POLISH — ticket final. Leer antes: `FE-POLISH_EPIC.md`, `WEB_INTERFACE_GUIDELINES.md`. Es una pasada de **texto/traducción**, no de lógica. Se hace al final para no traducir y después reestructurar.

## 0. Objetivo
Toda la UII visible al usuario en **español** (sin palabras en inglés) y **arreglar el mojibake** de encoding. Terminología consistente.

## 1. Alcance
Traducir a español TODO lo visible: labels de navegación, títulos de paneles, columnas de tablas, botones, placeholders, estados vacíos, tooltips, `aria-label`/`title` visibles al usuario, mensajes de estado/error, y textos de Help & Support. Incluye componentes como `Sidebar`, `Header`, `DashboardView`, `StudiesView`, `PatientsView`, `PatientHistoryView`, `StudyReviewView`, `MeasurementsPanel`, `AgentSummary`, `AuditTrail`, `SpineReconstructionPreview`, `AnalysisTimelineView`, `ProfessionalSettingsView`, `HelpSupportView`, etc.

Hoy quedan en inglés (grep-eables), por ejemplo: `Dashboard`, `Studies`, `Review Queue`, `Patients`, `History`, `Settings`, `Measurements`, `Value/Unit/Source/Status/Outlier/Delta/Metric`, `Notes`, `Save Draft`, `Approve & Complete`, `Reset to AI`, `Edit Mask`, `Add Landmark`, `Recalculate`, `Undo`, `AI Overlay`, `Export Summary`, `Add Study`, `Case Information`, `Patient-Safe Metadata`, `Series Navigator`, `Human review required`, `Longitudinal Overview`, `Study Repository`, `Recent Activity`, etc.

## 2. Glosario (usar consistente)
| Inglés | Español |
|---|---|
| Dashboard | Panel / Inicio |
| Studies | Estudios |
| Review Queue | Cola de revisión |
| Patients | Pacientes |
| History | Historial |
| Settings | Configuración |
| Help & Support | Ayuda y soporte |
| Measurements | Mediciones |
| Measurement | Medición |
| Value | Valor |
| Unit | Unidad |
| Confidence / Conf. | Confianza |
| Source | Origen |
| Status | Estado |
| Outlier | Atípico |
| Delta | Delta (o Diferencia) |
| Metric | Métrica |
| Notes | Notas |
| Save Draft | Guardar borrador |
| Approve / Approve & Complete | Aprobar / Aprobar y completar |
| Reset to AI | Restaurar valor IA |
| Edit Mask | Editar máscara |
| Add Landmark | Agregar landmark |
| Recalculate | Recalcular |
| Undo | Deshacer |
| AI Overlay | Overlay IA |
| Export Summary | Exportar resumen |
| Add Study | Agregar estudio |
| Case Information | Información del caso |
| Patient-Safe Metadata | Metadatos deidentificados |
| Series Navigator | Navegador de series |
| Human review required | Revisión humana requerida |
| Longitudinal Overview | Resumen longitudinal |
| Study Repository | Repositorio de estudios |
| Activity & Audit | Actividad y auditoría |
| Recent Activity | Actividad reciente |
| Pending Reviews | Revisiones pendientes |
| AI-Ready Studies | Estudios listos para IA |
| Model Status | Estado del modelo |
| Flagged Cases | Casos marcados |
| Search studies, cases, or patients… | Buscar estudios, casos o pacientes… |

(Nomenclatura clínica estándar puede mantenerse si corresponde: L1–S1, T2, sagital/axial, mm.)

## 3. Fix de encoding (mojibake)
- Archivos con mojibake detectado: al menos `App.tsx`, `Header.tsx`, `StudyReviewView.tsx` (secuencias `Ã`, `â€`, `Â`). Corregir los caracteres a UTF-8 correcto (acentos, ñ, viñetas/checks) y **guardar los archivos en UTF-8**.
- Revisar también los textos ya en español que muestran acentos rotos.

## 4. Reglas
- **No** introducir un framework de i18n multi-idioma en este ticket: es traducción directa a español. (La preferencia "idioma" de Settings queda como está; el switch multi-idioma real es un esfuerzo futuro aparte.)
- Los **valores técnicos de dato** (ej. `real_baseline`, `contract`, claves de estado del backend) NO se traducen si son valores/identificadores; sí se traduce el texto que los rodea y las etiquetas visibles.
- **No romper** flujos ni la lógica. No cambiar nombres de props/variables/clases, solo el texto visible.
- Los **reportes HTML export** (plantillas `<!doctype html>`) ya están mayormente en español: dejarlos consistentes y **sin mojibake**, sin romper su estructura.
- Solo texto; 0 cambios de tokens/estilo.

## 5. Criterios de aceptación
- [ ] `npm run build` OK (nº módulos) + `npm run lint` sin violaciones nuevas.
- [ ] No queda texto de UI en inglés (grep de los términos del §1/glosario ≈ 0 en texto visible). Reportar el conteo antes/después.
- [ ] Mojibake corregido; archivos en UTF-8; acentos/ñ correctos.
- [ ] Terminología consistente con el glosario.
- [ ] Flujos intactos (navegación, revisión, timeline, export).
- [ ] Smoke test visual en varias pantallas (todo en español, sin caracteres rotos).

## 6. Formato de devolución
```
### Revisión — FE-P2
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
Traducción: componentes cubiertos; términos en inglés antes → después (conteo)
Mojibake: archivos corregidos; UTF-8 confirmado
Términos técnicos preservados (valores de dato): cuáles
Flujos intactos: sí
a11y: violaciones nuevas (0 esperado)
Smoke test visual:
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
