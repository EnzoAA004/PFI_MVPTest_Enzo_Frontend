# FE-RD-000 — Brief de ejecución para Codex (Consolidar design system)

> Este documento es el encargo concreto de la Fase 0. Leer SIEMPRE antes: `docs/design/DESIGN_SPEC.md`, `docs/design/FE_REDESIGN_EPIC.md` y las 3 mockups `.jpeg` en `docs/design/`. Reglas transversales del epic (entorno, no romper flujos, honestidad) aplican.

## 0. Objetivo
Una única fuente de verdad visual: un sistema de **tokens** + **capas CSS** (base / components / utilities) y un set de **componentes base** que leen tokens. Cero colores hardcodeados en lo nuevo. No cambia lógica ni contratos; es refactor visual/estructural.

## 1. Estado actual auditado (punto de partida, medido sobre el repo)
- **7 CSS sueltos**, la mayoría **minificados en una sola línea** (imposibles de diffear/revisar): `theme.css`, `mri-theme.css`, `clinical-quiet.css`, `styles.css` (~1042 líneas), `worklist-table.css`, `visibility-controls.css`, `responsive.css`.
- **Casi sin tokens**: no hay `:root` de diseño salvo 2 variables ad-hoc (`--surface-shadow`, `--surface-border`) dentro de `mri-theme.css`. Todo lo demás es hex hardcodeado.
- **~197 hex hardcodeados en CSS + ~71 en estilos inline de `.tsx`** (≈268 instancias de color hardcodeado a migrar a tokens).
- **`responsive.css` es HUÉRFANO**: no se importa en ningún lado (146 líneas de código muerto). Las reglas responsive reales viven duplicadas dentro de `theme.css`, `mri-theme.css` y `clinical-quiet.css`.
- **Capas peleándose con `!important`**: `clinical-quiet.css` y bloques de `mri-theme.css` sobrescriben a `styles.css` con `!important` (parche sobre parche, no arreglo de raíz). Los `.compact-*` de `clinical-quiet.css` son un intento previo de "despresentar" pegado encima.
- **Deriva de color** (mismos roles con hex distintos, a unificar):
  - Muted/secundario: `#64748b` (24×), `#52657b`, `#60738a`, `#66809c`, `#475569`, `#334155` → todos deben mapear a `--text-muted`.
  - Sidebar oscuro: gradiente `#04111e/#071d31/#061522` (spec pide base `#0E1726`).
  - Superficies/azules sutiles one-off: `#f8fbff` (17×), `#eff6ff` (8×), `#d8e6f4` (6×), `#d3e1ef`, `#dbeafe`, `#eef4fb`… → colapsar a `--surface`/`--info-bg`/`--bg-app`.
  - Bordes: `#e2e8f0`, `#d8e6f4`, `#d3e1ef`, `#cbd5e1` → `--border`.
- Puntos de import actuales: `App.tsx` (`theme.css`, `mri-theme.css`), `main.tsx` (`styles.css`, `clinical-quiet.css`, `visibility-controls.css`), `WorklistTable.tsx` (`worklist-table.css`).

## 2. Entregable
### 2.1 Tokens — `src/design/tokens.css`
Definir en `:root` los tokens del DESIGN_SPEC §2. Set mínimo obligatorio:

```
/* Color */
--bg-app:#F7F8FA; --bg-sidebar:#0E1726; --surface:#FFFFFF; --border:#E5E7EB;
--text:#0F172A; --text-muted:#64748B; --primary:#2563EB; --ai:#7C3AED;
--success:#16A34A; --warning:#F59E0B; --danger:#DC2626; --info-bg:#EFF4FF;
/* Tipografía */
--font-sans:'Inter',system-ui,-apple-system,sans-serif;
--fs-h1:24px; --fs-h2:18px; --fs-h3:15px; --fs-body:14px; --fs-small:12px;
--fw-regular:400; --fw-medium:500; --fw-semibold:600;
/* Espaciado (escala 4px) */
--sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-6:24px; --sp-8:32px; --sp-12:48px;
/* Radios */
--radius-card:12px; --radius-btn:8px; --radius-input:8px; --radius-pill:999px; --radius-chip:6px;
/* Sombra */
--shadow-sm:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.10);
```
Semántica de estado (documentar como clases/utilidades, no hex sueltos): confianza verde ≥85% / ámbar 70–84% / rojo <70%; priority High=danger, Medium=warning, Low=muted; outlier=warning "Low".

### 2.2 Consolidación CSS → estructura por capas
Reorganizar en:
- `src/design/tokens.css` (solo variables).
- `src/design/base.css` (reset, `html/body`, tipografía, layout de `AppShell`).
- `src/design/components.css` (Card, Button, badges, Table, tabs, forms, viewers, etc.).
- `src/design/utilities.css` (helpers: spacing, flex/grid, text-muted…).

Migración:
1. **Eliminar `responsive.css`** (huérfano) y reconstruir su intención dentro de `base.css` con media queries limpias (breakpoints del spec: ≥1280px viewers lado a lado; sidebar colapsable en chico).
2. Fundir `theme.css`, `mri-theme.css`, `clinical-quiet.css`, `styles.css`, `worklist-table.css`, `visibility-controls.css` en las 4 capas. **Un solo import ordenado** (tokens → base → components → utilities) en `main.tsx`; quitar los imports dispersos de `App.tsx` y `WorklistTable.tsx`.
3. Reemplazar cada hex por su token (usar el mapa de §1). **Meta: 0 hex nuevos y `!important` solo como excepción documentada** (idealmente eliminar los actuales resolviendo especificidad, no agregando más).
4. Archivos CSS resultantes **NO minificados** (una regla por línea / prettier), para que sean revisables por diff.

### 2.3 Componentes base (leen tokens, sin hex)
Card, Button (primary/secondary/ghost/danger), StatusBadge, ConfidenceBadge, PriorityTag, Tab, Table (densa, zebra sutil), FormField (label+input+error), Toggle, EmptyState, Toast. No reescribir la lógica de los componentes de negocio; extraer estos primitivos y que los existentes los reutilicen donde sea directo.

### 2.4 Tooling de accesibilidad (dev, entra en esta fase)
- Agregar `eslint-plugin-jsx-a11y` (config recomendada) al lint.
- Agregar `@axe-core/react` en modo dev (no en prod) para reportar violaciones a11y en consola.
- Reportar qué reglas quedaron activas y cuántas violaciones detectó en el estado actual (baseline, no hace falta arreglarlas todas en esta fase).

## 3. Criterios de aceptación
- [ ] `npm run build` OK. Reportar salida real y nº de módulos (baseline sano ~1829–1830).
- [ ] `responsive.css` eliminado; los 6 restantes fundidos en `tokens/base/components/utilities`; imports unificados en `main.tsx`.
- [ ] Sin hex hardcodeados en el CSS nuevo (grep debe dar ~0 fuera de `tokens.css`). Reportar el conteo antes/después.
- [ ] Componentes base creados y leyendo tokens.
- [ ] Flujos existentes intactos (carga → run real → overlays → revisión) — verificación visual.
- [ ] a11y tooling instalado + baseline reportado.
- [ ] CSS resultante no minificado (revisable por diff).

## 4. Fuera de alcance de esta fase
Rediseñar pantallas (eso es Fase 1+), tocar visores internos, editar mediciones/landmarks, cambiar contratos o backend. Solo: tokens + capas + componentes base + tooling a11y.

## 5. Formato de devolución (pegar así al cerrar la fase)
```
### Revisión — FE-RD-000
Instalación usada: npm ci / npm install (cuál y por qué)
Build: <salida real + nº módulos>
Archivos nuevos: ...
CSS eliminados/fundidos: ...
Hex hardcodeados antes → después: N → M
a11y: reglas activas + nº violaciones baseline
Notas / decisiones / deuda dejada:
```
