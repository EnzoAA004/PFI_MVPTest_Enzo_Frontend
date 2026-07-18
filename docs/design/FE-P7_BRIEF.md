# FE-P7 — Brief de ejecución para Codex (Pasada de accesibilidad — axe AA)

> Epic FE-POLISH — cierre. Leer antes: `FE-POLISH_EPIC.md`, `WEB_INTERFACE_GUIDELINES.md` (§Accesibilidad AA). Usar tokens de `src/design/`. Resuelve las violaciones de axe runtime reportadas en P3.

## 0. Objetivo
Resolver las violaciones de accesibilidad que `eslint-plugin-jsx-a11y` (estático) no detecta pero **axe runtime** sí, para cumplir WCAG **AA**. Verificar con axe.

## 1. Violaciones a resolver (medidas)

### 1.1 color-contrast (contraste < AA)
Ratios calculados sobre `--surface #FFF` / `--bg-app #F7F8FA` / `--bg-sidebar #0E1726`:
| Uso actual | Ratio | Estado |
|---|---|---|
| `--warning #F59E0B` como **texto** sobre blanco | 2.15 | ❌ falla |
| `--success #16A34A` como **texto** sobre blanco | 3.30 | ❌ falla (texto normal) |
| `--text-muted #64748B` sobre `--bg-app` | 4.48 | ❌ apenas debajo de 4.5 |
| `--text-muted #64748B` sobre `--bg-sidebar` | 3.77 | ❌ falla |

**Fix:**
- Para **texto** semántico (badges ámbar, verde, etc.), usar los tokens **`--text-warning-strong` / `--text-success-strong` / `--text-danger-strong` / `--text-ai-strong` / `--text-primary-strong`** (ya existen en `tokens.css`). Reservar los colores base (`--warning`, `--success`, …) para **rellenos/bordes/íconos**, no para texto chico sobre fondo claro. Verificar que cada `*-strong` alcance ≥4.5 sobre su fondo; si alguno no llega, ajustarlo.
- **`--text-muted`**: nudge a un valor un poco más oscuro que alcance **≥4.5 sobre `--bg-app`** (hoy 4.48). Verificar que siga bien sobre `--surface`. Como es un token global, revisar que no rompa la estética (revisión visual).
- **Texto muted en el sidebar oscuro**: usar un token de texto secundario **más claro** que alcance ≥4.5 sobre `--bg-sidebar #0E1726` (ej. un `--sidebar-text-muted` nuevo/ajustado). No usar `--text-muted` (slate oscuro) sobre el sidebar.
- Barrer badges/chips (confidence, priority, estados) y asegurar que el **texto** de cada uno pase AA sobre su fondo real.

### 1.2 aria-required-children (roles sin los hijos requeridos)
- `role="tablist"` en `DashboardView` (worklist-filter-tabs) y `PatientHistoryView` (history-tabs): los botones hijos deben tener **`role="tab"`** (y el patrón tab/tablist completo: `aria-selected`, y `role="tabpanel"` en el contenido si aplica).
- `role="menu"` en `Header` (profile-menu-panel): los ítems deben ser **`role="menuitem"`**.
- `role="table"` en `StudyReviewView` (measurement-review-table) con `role="row"`: **completar** con `role="columnheader"` en el head y `role="cell"` en las celdas — o, preferible, **usar una `<table>` semántica real** (thead/tr/th/td) en vez de divs con roles ARIA. Elegir lo más robusto sin romper el layout.

### 1.3 empty-table-header (`<th>` vacío)
- Buscar el `<th>` sin texto (probable columna de checkbox/ícono en `WorklistTable`). Darle **texto accesible**: `aria-label` o un span visualmente oculto (clase sr-only), no dejarlo vacío.

### 1.4 scrollable-region-focusable (región scrolleable no enfocable por teclado)
- `.table-wrap` (overflow-x:auto) y `.audit-list` (overflow:auto), y cualquier otro contenedor scrolleable: agregar **`tabindex="0"`** y un `role`/`aria-label` apropiado para que el usuario de teclado pueda desplazarlos.

## 2. Reglas / alcance
- Solo accesibilidad: no cambiar lógica ni contenido de dato.
- Cambios de color **solo vía tokens** (0 hex nuevos); si se ajusta `--text-muted` o se agrega un token de sidebar, hacerlo en `tokens.css`.
- No romper el diseño aprobado: revisión visual tras los ajustes de token.
- No tocar contratos, backend, ni los reportes HTML export.

## 3. Criterios de aceptación
- [ ] `npm run build` OK + `npm run lint` sin violaciones nuevas.
- [ ] **axe runtime** sobre Dashboard y Case Review: **0** violaciones de `color-contrast`, `aria-required-children`, `empty-table-header`, `scrollable-region-focusable` (reportar el before/after de axe).
- [ ] Texto semántico usa los tokens `*-strong`; base solo para fills/íconos.
- [ ] `--text-muted` (y sidebar) pasan AA sobre sus fondos reales; verificado numéricamente.
- [ ] tablist/menu/table con roles/hijos correctos (o `<table>` real).
- [ ] `<th>` vacío con texto accesible; regiones scrolleables enfocables.
- [ ] Solo tokens; 0 hex nuevos; `!important` ausente o justificado.
- [ ] Revisión visual: sin regresiones estéticas por los cambios de token.
- [ ] Smoke test visual + salida de axe.

## 4. Formato de devolución
```
### Revisión — FE-P7
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
axe before → after (por regla): color-contrast / aria-required-children / empty-table-header / scrollable-region-focusable
Contraste: tokens *-strong aplicados dónde; --text-muted ajustado a (valor + ratio sobre bg-app); token sidebar
Roles: tablist/tab, menu/menuitem, table (roles o <table> real)
th vacío: cómo se resolvió
Scroll enfocable: qué contenedores
Regresión visual: revisada
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
