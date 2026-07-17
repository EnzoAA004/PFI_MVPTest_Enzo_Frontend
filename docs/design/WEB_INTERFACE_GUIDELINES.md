# Web Interface Guidelines — Lumbar MRI Analysis Platform

> Reglas de interfaz para todo el frontend, basadas en las *Web Interface Guidelines* de Vercel, adaptadas a este producto clínico. Son un **contrato de calidad**: Codex las aplica al construir y se usan como checklist de revisión en cada fase FE-RD. Complementan `DESIGN_SPEC.md` (que define tokens y pantallas); acá van las reglas de comportamiento/calidad transversales.

## Principio rector clínico
Densidad de información alta pero jerarquizada; sobrio, no cargado. Y por encima de todo, **honestidad visible**: modo de inferencia (`real_baseline` vs `contract/fallback`), confianza, outliers, "Human review required", deidentificación. Nunca inventar datos ni simular capacidades inexistentes (ver §7/§8 del DESIGN_SPEC).

## Interactividad
- Todo elemento accionable es un control real (`<button>`, `<a>`, `<input>`), navegable por teclado y con `:focus-visible` claro. Nada de `div` clickeable.
- Estados completos para cada control: default, hover, active, focus, disabled, loading. Un botón que dispara trabajo async muestra estado de carga y evita doble submit.
- Áreas de toque ≥ 44×44px (ya presente en el CSS actual; mantener).
- Acciones destructivas o clínicas (Approve & Complete, Recalculate, Edit Mask) piden confirmación o son claramente reversibles (Undo). Nunca ejecutar algo irreversible en un solo click accidental.
- No deshabilitar el zoom del navegador; respetar `prefers-reduced-motion`.

## Tipografía
- Familia y escala según DESIGN_SPEC §2 (Inter / system-ui; H1 24/600 … body 14). Usar tokens, no tamaños sueltos.
- Valores de medición con `font-variant-numeric: tabular-nums` (alineación de números en tablas de mediciones y trends).
- Line-height cómodo en texto largo (≈1.5); evitar líneas > ~75 caracteres en párrafos.

## Layout y jerarquía
- Grid responsive del spec: viewers lado a lado en ≥1280px, apilado debajo; sidebar colapsable en pantallas chicas.
- Una sola escala de espaciado (4px). Alinear a la grilla; evitar padding/márgenes mágicos.
- Jerarquía visual por tamaño/peso/color de token, no por colores nuevos. Menos bordes y sombras pesadas; usar `--shadow-sm`.
- Densidad como la mockup: tablas densas con zebra sutil, cards con aire interno (16–24px), sin decoraciones que compitan con los datos clínicos.

## Color y estado
- Solo tokens. Cero hex hardcodeado en componentes.
- Semántica consistente: confianza verde ≥85% / ámbar 70–84% / rojo <70%; priority High=danger, Medium=warning, Low=muted; outlier=warning.
- **IA vs Humano siempre diferenciados**: lo generado por el modelo y lo editado por el revisor deben distinguirse (color `--ai` para IA, y etiquetas "AI (Initial)" vs "Reviewer (Final)").
- El color nunca es el único portador de significado (acompañar con texto/ícono) — requisito de accesibilidad.

## Formularios y edición
- Cada campo: label asociado (`for`/`id`), estados de error inline con texto (no solo borde rojo), y `aria-describedby` para el mensaje.
- Validación al momento correcto (no gritar errores mientras el usuario todavía escribe); confirmar éxito de guardado (Save Draft) con feedback visible.
- En edición de mediciones/landmarks: mostrar valor before/after y "Reset to AI"; los cambios locales no persistidos deben verse como borrador.

## Estados vacíos, carga y error (honestos)
- Empty states con copy útil que explique por qué está vacío y qué hacer. Para features "Futuro" (longitudinal, trends, AI-vs-Reviewer, coronal, edit-mask, 3D volumétrico): estado vacío honesto ("sin histórico disponible" / "requiere pipeline X"), **nunca datos inventados**.
- Skeletons o spinners para carga; nunca layout que salte (reservar espacio).
- Errores con mensaje humano + acción de recuperación; distinguir error del modelo (`Failed`) de error de red.

## Movimiento
- Animaciones cortas y funcionales (150–250ms, easing suave); comunican cambio de estado, no decoran.
- Respetar `prefers-reduced-motion: reduce` (desactivar transiciones no esenciales).

## Accesibilidad (AA, no negociable)
- Contraste texto ≥ 4.5:1 (≥ 3:1 para texto grande y elementos de UI). Verificar sobre `--bg-app` y `--bg-sidebar`.
- Foco visible en todo control; orden de tabulación lógico; navegación completa por teclado, incluida la búsqueda ⌘K.
- Roles/estados ARIA correctos en tabs, tablas, toggles, badges de estado, diálogos. Overlays de imagen con alternativa textual de la información clínica (leyenda, tabla de mediciones).
- Íconos-only con `aria-label`. Toggles con `role="switch"` y `aria-checked`.
- Validado con `eslint-plugin-jsx-a11y` + `@axe-core/react` en dev; 0 violaciones nuevas por PR.

## Rendimiento
- No bloquear el render con trabajo pesado; los visores/3D cargan de forma diferida.
- Imágenes/overlays dimensionados para evitar reflow; listas largas (worklist) paginadas o virtualizadas.
- Evitar re-renders innecesarios en paneles de revisión (memoizar donde aplique).

## Privacidad y seguridad de UI
- Nunca mostrar datos identificables ni paths internos. Metadata siempre "patient-safe" (PAT-xxxx, Age/Sex unknown, De-identified badge).
- Banner de privacidad persistente donde corresponde (HIPAA Safe Harbor, "Human review required. Not for clinical diagnosis").
- El 3D es atlas genérico etiquetado "no paciente-específico" hasta que exista pipeline volumétrico.

## Checklist rápido de PR (por fase FE-RD)
- [ ] Solo tokens, 0 hex nuevos, `!important` justificado o ausente.
- [ ] Teclado + foco visible + roles ARIA en lo tocado.
- [ ] Contraste AA verificado.
- [ ] Estados: default/hover/active/focus/disabled/loading/empty/error.
- [ ] Honestidad: real_baseline vs fallback, IA vs revisor, features futuras con estado vacío honesto.
- [ ] `prefers-reduced-motion` respetado.
- [ ] `npm run build` OK; a11y lint sin violaciones nuevas.
- [ ] Coincide con la mockup en jerarquía/densidad; alcance acotado a la fase.
