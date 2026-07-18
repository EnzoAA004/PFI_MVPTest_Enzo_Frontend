# FE-P3 — Brief de ejecución para Codex (Vista 3D: interactividad y estilo)

> Epic FE-POLISH. Leer antes: `FE-POLISH_EPIC.md`, `WEB_INTERFACE_GUIDELINES.md`, y `DESIGN_SPEC.md` §6 (el 3D es atlas genérico honesto, no paciente-específico — se mantiene). Usar tokens/componentes de `src/design/`.

## 0. Objetivo
Mejorar la interactividad y el estilo del panel 3D (`SpineReconstructionPreview.tsx`, atlas genérico con Three.js de FE-RD-006), y corregir el centrado del panel y del Recent Activity. Sin romper la honestidad del 3D.

## 1. Estado actual (a mejorar)
- `SpineReconstructionPreview.tsx`: modelo procedural L1–S1 (`levels = ["L1","L2","L3","L4","L5","S1"]`, cada vértebra un `Mesh`). Los `L1–S1` de la UI son `<span className="spine-level-labels">` **estáticos** (aria-hidden), no botones.
- Controles Zoom In / Zoom Out / Rotate / Fit: botones **grises sobre fondo blanco** (estilo pobre).
- Rotación: `gentleIntro` auto-rota salvo `prefers-reduced-motion` del SO. No hay control del usuario para detenerla.
- El panel 3D y el "Recent Activity" (en `DashboardView`) se ven **corridos a la izquierda**, no centrados.

## 2. Entregable
### 2.1 Botones L1–S1 que colorean la región
- Convertir los labels L1–S1 en **botones interactivos**. Al seleccionar un nivel, **colorear/resaltar la vértebra correspondiente** en la escena 3D (cambiar material/emissive del mesh de ese nivel; el resto queda neutro).
- Mantener referencia a cada mesh por nivel para poder resaltarlo. Color de selección con **token** (ej. `--primary` o `--ai`), no hex.
- El botón del nivel seleccionado se ve activo (estado claro), con foco visible y `aria-pressed`/`aria-current`. Poder deseleccionar.
- ⚠️ Honestidad: es un atlas **genérico**; resaltar un nivel es orientación/contexto, NO implica datos del paciente. Mantener la etiqueta "no paciente-específico".

### 2.2 Toggle para detener la rotación
- Agregar un control **play/pausa** de la rotación. **Por defecto: quieta** (el usuario pidió que no se mueva sola); con opción de activar rotación.
- Seguir respetando `prefers-reduced-motion` (si el SO lo pide, arranca quieta igual).

### 2.3 Estilo de los botones/controles
- Reestilizar Zoom/Rotate/Fit (y los nuevos controles) con los **componentes/tokens** del design system (variantes de Button), no gris-sobre-blanco. Consistente con el resto de la app.

### 2.4 Centrado
- **Centrar el modelo 3D** dentro de su contenedor (hoy corrido a la izquierda).
- **Centrar el "Recent Activity"** en `DashboardView` (mismo problema de alineación).

## 3. Honestidad / alcance
- El 3D sigue siendo atlas genérico honesto (FE-RD-006): etiqueta persistente, Modo B (volumétrico) deshabilitado con requiredInputs. No convertirlo en algo que parezca del paciente.
- No romper el 3D en Dashboard ni en Case Review (tab 3D).
- Carga diferida de three se mantiene; canvas con label/a11y.

## 4. Criterios de aceptación
- [ ] `npm run build` OK (nº módulos) + `npm run lint` sin violaciones nuevas.
- [ ] L1–S1 son botones; seleccionar uno colorea esa vértebra en el 3D; token, foco, aria.
- [ ] Toggle de rotación presente; por defecto quieta; respeta reduced-motion.
- [ ] Controles reestilizados con tokens (no gris-sobre-blanco).
- [ ] Modelo 3D centrado; Recent Activity centrado.
- [ ] Etiqueta "no paciente-específico" intacta; 3D honesto en Dashboard y Case Review.
- [ ] Solo tokens; 0 hex nuevos; `!important` ausente o justificado.
- [ ] Smoke test visual (seleccionar niveles, pausar/activar rotación, centrado).

## 5. Fuera de alcance
Case Review polish de measurements/notas (P4), traducción total (P2), 3D volumétrico real (chat técnico). No tocar contratos ni backend.

## 6. Formato de devolución
```
### Revisión — FE-P3
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
Botones L1–S1: cómo se colorea la vértebra; token usado
Toggle rotación: default quieta; reduced-motion
Estilo controles: cómo quedaron (tokens)
Centrado: modelo 3D y Recent Activity
Honestidad 3D (atlas genérico / etiqueta): intacta
a11y: violaciones nuevas (0 esperado)
Smoke test visual:
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
