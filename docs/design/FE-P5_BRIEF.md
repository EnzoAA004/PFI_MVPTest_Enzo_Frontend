# FE-P5 — Brief de ejecución para Codex (Carga de resonancia como timeline guiado + gating)

> Epic FE-POLISH. Ticket más grande. Leer antes: `FE-POLISH_EPIC.md` (decisiones), `WEB_INTERFACE_GUIDELINES.md`, `DESIGN_SPEC.md`. Usar tokens/componentes de `src/design/`.

## 0. Objetivo
Reorganizar el flujo de análisis en un **timeline guiado de 4 pasos**, gateando la ejecución a que haya un **estudio real cargado** (nada de mocks/demo). Reusar lo que ya existe (no reescribir la lógica de backend).

## 1. Estado actual (piezas ya existentes a reusar)
- `MultiplanarWorkspaceCard.tsx` ya tiene: upload por plano (`uploadAiInput`, estados idle/uploading/uploaded/error), `runMultiplanarAnalysis`, estados de contrato (`contract_only_missing_artifact`, `multiplanar_unavailable`), y submit de review (`submitRunReview`, reviewStatus/reviewer/comments). Es toda la materia prima del timeline, hoy en una card técnica.
- Header: "Ejecutar análisis" → `onRunDemo` (corre demo/mock), disabled solo por `loading`. **Esto es lo que hay que gatear/reemplazar.**
- Case Review (`StudyReviewView`) = la evaluación (mediciones editables, 3D, agent summary, approve). El timeline la integra en los pasos 3–4.

## 2. Entregable — timeline guiado de 4 pasos
Crear una vista/flujo dedicado (nuevo `ViewKey`, ej. `analysis` / "Nuevo análisis") con un **stepper** de 4 pasos. El paso activo se resalta; no se puede saltar un paso sin completar el anterior.

### Paso 1 — Cargar estudio
- Upload de sagital / axial (reusar `uploadAiInput` + inputs de archivo). Mostrar archivos cargados y validación (tipo/plano).
- **Gate:** no habilitar el paso 2 hasta que esté cargado el/los plano(s) requerido(s). Estado claro de qué falta.

### Paso 2 — Procesamiento (espera del modelo)
- Disparar `runMultiplanarAnalysis` y mostrar estado de **espera** honesto.
- ⚠️ **Honestidad:** si el backend no da señal real de progreso, mostrar "procesando / esperando respuesta del modelo" **sin barra de progreso falsa** ni porcentajes inventados.
- ⚠️ **Data honesty (distinto del compliance chrome que se removió en P6):** si el run vuelve en **contrato/fallback** (sin inferencia real / artifacts faltantes), **NO** presentar mediciones placeholder como resultado final. Mostrar un estado honesto ("el modelo aún no tiene inferencia real disponible") y no avanzar a "evaluación" como si fueran mediciones reales. Reportar cómo se detecta esto desde la respuesta del backend.

### Paso 3 — Evaluación
- Mostrar la evaluación real del run: **mediciones** (tabla, editables — se mantiene FE-RD-004), **modelo 3D** (atlas genérico honesto de FE-RD-006), y el **preinforme generado** (AI Agent Summary: findings + impression, como borrador a revisar).
- Reusar los paneles de `StudyReviewView` donde aplique; no duplicar lógica.

### Paso 4 — Aprobar o editar
- Acción final: **Aprobar el reporte** o **editarlo** con el feedback del profesional (mediciones editables + Reset to AI + notas). Persistir por el flujo de review existente (`submitRunReview` / `handleSaveReview`).
- Al aprobar, transición clara (a Case Review del caso o a un estado "aprobado").

## 3. Gating del "Ejecutar análisis"
- **Quitar el run sobre demo/mock** del header (`onRunDemo` que corre el demo por defecto).
- El header pasa a **"Nuevo análisis"** que navega al timeline (o se quita si el timeline se accede desde Studies). El "Ejecutar análisis" real vive en el paso 2 y está **deshabilitado hasta que haya estudio real cargado** en el paso 1.
- En ningún caso ejecutar análisis sobre estudios mock.

## 4. Reubicación
- El timeline **reemplaza** el uso técnico de `MultiplanarWorkspaceCard` en Settings: mover esa funcionalidad al timeline y **sacar `MultiplanarWorkspaceCard` de Settings** (queda Settings solo con la config del profesional de P6). Si conviene, reusar internamente el componente; lo importante es que el usuario acceda vía el timeline, no desde Settings.

## 5. Honestidad / alcance
- Nada de mocks: no ejecutar ni evaluar sobre estudios demo.
- Sin progreso falso ni mediciones inventadas; contrato/fallback marcado honestamente a nivel de datos.
- No romper: apertura de casos existentes, review/approve, auditoría.
- 3D = atlas genérico (FE-RD-006). Mediciones editables (FE-RD-004).
- La traducción total a español es P2; el contenido nuevo va en español.

## 6. Dependencias para el chat técnico (reportar, no resolver)
- Señal real de progreso/estado del procesamiento del modelo (paso 2).
- Inferencia real vs contrato (artifacts): para que el paso 3 muestre mediciones reales.
- "Charlar con el modelo" (feedback conversacional) = feature futura.

## 7. Criterios de aceptación
- [ ] `npm run build` OK (nº módulos) + `npm run lint` sin violaciones nuevas.
- [ ] Timeline de 4 pasos funcional con stepper; no se saltan pasos.
- [ ] Paso 1 gatea el 2; "Ejecutar análisis" deshabilitado sin estudio real cargado.
- [ ] Sin run sobre demo/mock (removido del header).
- [ ] Paso 2 sin progreso falso; contrato/fallback marcado honestamente (sin mediciones placeholder como reales).
- [ ] Pasos 3–4 reusan evaluación existente (mediciones editables, 3D honesto, agent summary, approve/edit).
- [ ] `MultiplanarWorkspaceCard` fuera de Settings (reubicado en el timeline).
- [ ] Solo tokens; 0 hex nuevos; `!important` ausente o justificado.
- [ ] Smoke test visual del timeline completo (con estudio y sin estudio).

## 8. Nota de tamaño
Si es demasiado para una sola pasada, se puede entregar en dos: (a) pasos 1–2 + gating, luego (b) pasos 3–4 + reubicación. Reportar si se divide.

## 9. Formato de devolución
```
### Revisión — FE-P5
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
Timeline: vista/stepper; cómo se gatea cada paso
Paso 1 (upload) / gating "Ejecutar análisis": cómo
Paso 2 (procesamiento): estado honesto; cómo se detecta contrato/fallback; sin progreso falso
Paso 3 (evaluación): qué se reusó
Paso 4 (aprobar/editar): cómo persiste
Run sobre demo/mock removido: sí/no
MultiplanarWorkspaceCard reubicado (fuera de Settings): cómo
Dependencias para el chat técnico:
a11y: violaciones nuevas (0 esperado)
Smoke test visual:
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
