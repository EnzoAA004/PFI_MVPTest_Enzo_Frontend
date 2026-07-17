# FE-RD-003 — Brief de ejecución para Codex (Visores radiológicos 2D)

> Depende de FE-RD-000/001/002. Leer SIEMPRE antes: `DESIGN_SPEC.md` (§5 y §6), `WEB_INTERFACE_GUIDELINES.md`, y la mockup de **Case Review** (visores Sagittal/Axial). Usar tokens/componentes de `src/design/`.

## 0. Objetivo
Visor sagital/axial tipo radiólogo (enfocado, no paridad con 3D Slicer): **Window/Level (W/L), zoom/pan, fit, toggle de overlay + opacidad, y visibilidad de capas por clase** — todo operando sobre el **asset real servido** por backend, con **honestidad** sobre las limitaciones actuales.

## 1. ⚠️ Punto de partida crítico: el visor actual es SIMULADO
`MriSliceViewer.tsx` hoy **NO muestra la resonancia real**. Dibuja una imagen falsa con gradientes CSS (`.sagittal-canvas`, `.axial-canvas`, `.scan-noise`, `.scan-ruler`), las máscaras son `div`s posicionados a mano (`.mask-canal`, `.mask-disc`), y "Slice 58/96 · W 1500 · L 450 · 13.8 mm" son **texto hardcodeado**. Esto viola la honestidad del spec (§5) y es el foco central de esta fase: **reemplazar la simulación por el asset real, o por un estado vacío honesto.**

Ya existe un renderer de asset real reutilizable: **`MultiplanarWorkspaceCard.tsx`** carga `aiAssetUrl(runId, plane, "input.png")` y `"overlay.png"` con manejo de "no disponible desde backend". Reusar ese patrón en el visor de Case Review.

## 2. Entregable — visor sobre asset real (DESIGN_SPEC §5)
### 2.1 Imagen base
- Renderizar el **`input.png` real** del run (vía `aiAssetUrl`). Si no carga: **estado vacío honesto** ("imagen no disponible desde backend"), nunca el gradiente simulado.
- Eliminar/retirar la simulación CSS (`scan-noise`, gradientes de `.sagittal-canvas`/`.axial-canvas`) del camino de render real.

### 2.2 Window/Level (W/L)
- W/L con **presets** y ajuste por **drag** (arrastrar sobre la imagen). Aplicado de verdad al asset (ej. `filter: brightness()/contrast()` sobre el PNG, o canvas).
- ⚠️ **Honestidad:** operamos sobre un **PNG de 8 bits pre-renderizado**, no sobre datos DICOM crudos. El W/L acá es una **aproximación visual**, no windowing radiológico real. Mostrar el W/L actual y **documentar la limitación** (tooltip o nota: "W/L aproximado sobre asset; windowing DICOM real requiere AI-009"). No mostrar "W 1500 / L 450" como si fuera dato real del estudio salvo que venga del backend.

### 2.3 Zoom / Pan / Fit
- Zoom (rueda + botones), pan (drag), y botón **Fit**. Estado de transform por visor. Cursor y controles claros.

### 2.4 Overlay AI + opacidad
- Toggle "AI Overlay" que muestra/oculta el **`overlay.png` real** superpuesto (ya hay control de opacidad; conectarlo al overlay real). Si no hay overlay: toggle deshabilitado + estado honesto.

### 2.5 Capas por clase / visibilidad (FE-007)
- Leyenda de segmentación con visibilidad por clase (mostrar/ocultar cada clase), usando los **mask-tokens**.
- ⚠️ **Dependencia backend:** la visibilidad *real* por clase requiere que backend sirva **máscaras por clase** (no un solo `overlay.png` combinado). Si hoy solo hay overlay combinado, implementar la UI de visibilidad por clase pero marcar honestamente que aplica sobre el overlay combinado / o dejar los controles con estado "requiere máscaras por clase (FE-007/AI-017)". **No fingir** que se ocultan clases individuales si técnicamente no se puede. Reportar qué sirve el backend hoy.

### 2.6 Espacio de coordenadas
- Mostrar el espacio de coordenadas visible (**model_256 vs original**) cuando esté disponible — conecta con AI-011. Si no viene del backend, no inventarlo.

### 2.7 Cortes (slices)
- ⚠️ **Honestidad:** el modelo actual es de **un solo corte** por plano. El slider "1/96" actual es falso. Mostrar el/los corte(s) **realmente servidos**; si es uno solo, **no** mostrar un slider de 96 que no navega nada. Documentar que la navegación multi-corte real depende de **AI-009 (DICOM)**.

## 3. Honestidad (no negociable, §5/§8)
- Nada de imagen simulada presentada como resonancia del paciente.
- W/L, cortes, coordenadas y capas: reales o marcados como limitación; nunca datos inventados.
- Mediciones/landmarks **editables** siguen como están (Fase 4 profundiza); no romper el flujo.
- 3D sigue siendo atlas genérico (Fase 6).

## 4. Límites con backend/IA (van al chat técnico, no se resuelven acá)
W/L DICOM real + navegación de cortes (AI-009), máscaras por clase (AI-017/FE-007), espacio de coordenadas (AI-011). Si esta fase necesita algo de eso, **reportarlo como dependencia** para el chat de planificación técnica; en el frontend solo hacemos lo posible sobre el asset servido + estados honestos.

## 5. Criterios de aceptación
- [ ] `npm run build` OK (reportar nº módulos) + `npm run lint` sin violaciones nuevas.
- [ ] El visor muestra el **asset real** (input.png/overlay.png) o estado vacío honesto — **cero simulación CSS** en el render real.
- [ ] W/L (presets + drag), zoom/pan, fit y opacidad de overlay funcionan sobre el asset real.
- [ ] Visibilidad por clase implementada, con honestidad sobre qué sirve el backend hoy.
- [ ] Slices y W/L reflejan lo real; limitaciones (PNG/single-slice/DICOM) documentadas en UI.
- [ ] Solo tokens; 0 hex nuevos; `!important` ausente o justificado.
- [ ] Flujo intacto (abrir caso → revisar → guardar).
- [ ] Smoke test visual (screenshot o descripción) con y sin asset disponible.

## 6. Fuera de alcance
Edición de landmarks/mediciones sobre la imagen (Fase 4), longitudinal (Fase 5), 3D volumétrico real (Fase 6). No tocar contratos ni backend.

## 7. Formato de devolución
```
### Revisión — FE-RD-003
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
Asset real: input.png/overlay.png cargados sí/no; estado vacío honesto sí/no
W/L: presets + drag; cómo se aplica; limitación documentada
Zoom/pan/fit: ok
Visibilidad por clase: qué sirve el backend hoy (overlay combinado vs por clase); cómo se marcó
Slices: cuántos sirve el backend; cómo se resolvió el slider falso
Simulación CSS eliminada del render real: sí/no
Dependencias para el chat técnico (AI-009/AI-011/AI-017/FE-007):
a11y: violaciones nuevas (0 esperado)
Smoke test visual:
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
