# FE-P1 — Brief de ejecución para Codex (Navegación + Header)

> Epic FE-POLISH. Leer antes: `FE-POLISH_EPIC.md` (decisiones), `WEB_INTERFACE_GUIDELINES.md`. Usar tokens/componentes de `src/design/`. Reglas transversales del epic aplican.

## 0. Objetivo
Arreglar la navegación lateral y limpiar el header según el feedback. Sin romper flujos.

## 1. Sidebar — fix del tab activo (bug estructural)
**Problema real (`Sidebar.tsx`):** hay 6 items de nav pero `resolveTarget` los colapsa a 4 vistas (`studies`+`queue`→`review`; `patients`+`history`→`history`). Además el cálculo de `selected` desempata siempre a favor de `queue`/`history`. Por eso al clickear **Studies se ilumina Review Queue**.
**Fix:**
- Cada item de nav debe ser su **propia vista** con su **propio estado activo** (el highlight sigue al item clickeado, no a un alias).
- Convertir en pantallas reales distintas: **Studies** (listado completo de estudios), **Review Queue** (mismo listado filtrado a pendientes de revisión, con el contador), **Patients** (listado de pacientes), **History** (longitudinal del paciente). Reusar componentes existentes (worklist/tabla) con el filtro/props correspondiente; no reescribir lógica.
- Si alguna pantalla no tiene aún contenido propio real, mostrar un estado honesto ("sin datos" / placeholder), nunca contenido duplicado que confunda.
- El item activo usa el tratamiento de la mockup (fondo sutil con tokens), foco visible y `aria-current="page"`.

## 2. Header — limpieza (feedback + decisión de compliance)
En `Header.tsx`:
- **Sacar el hint "⌘K"** del buscador (el ícono `Command` + el "⌘K"). Dejar solo el placeholder de búsqueda. El atajo de teclado puede seguir funcionando, pero sin el chip visual.
- **Sacar el badge de modo** "Academic / De-identified Data" (mode-badge) y el badge "Backend {health} / {modelCount} models". (Decisión de compliance: los avisos de modo salen de la UI; el detalle va a Help & Support en P6.)
- **Sacar "Copiar Run ID"** (no aporta al usuario).
- **Campana (Bell):** hoy no hace nada y no hay sistema de notificaciones → **removerla** (si en el futuro hay notificaciones reales, se reintroduce con backend). No dejar un botón muerto.
- **Perfil (profile-chip):** hoy no hace nada → convertirlo en un **menú funcional** (dropdown) con: ver/editar perfil (lleva a Settings), y **cerrar sesión**. Foco/teclado/aria correctos.
- **Alineación del header en Studies/Review:** hoy se ve desalineado. Alinear a la grilla del shell (search a la izquierda, acciones a la derecha, misma altura), consistente en todas las vistas.
- **"Ejecutar análisis":** en este ticket **no** cambiar su lógica de gating (eso es P5); solo dejarlo bien alineado. El gating a estudio real cargado se implementa en P5.

## 3. Honestidad / alcance
- No inventar contenido para las nuevas pantallas (Studies/Patients): dato real o estado vacío honesto.
- No romper: apertura de revisión desde la worklist, búsqueda, logout.
- No tocar los generadores de reportes/HTML export de `Header.tsx`.

## 4. Criterios de aceptación
- [ ] `npm run build` OK (nº módulos) + `npm run lint` sin violaciones nuevas.
- [ ] Clickear cada item ilumina **ese** item; Studies ≠ Review Queue ≠ Patients ≠ History como destinos.
- [ ] Header sin ⌘K, sin badges de modo/backend, sin "Copiar Run ID", sin campana muerta.
- [ ] Perfil abre menú funcional con logout.
- [ ] Header alineado y consistente en Dashboard/Studies/Review/Patients.
- [ ] Solo tokens; 0 hex nuevos; `!important` ausente o justificado.
- [ ] Smoke test visual de la navegación (cada item) + header en 2-3 vistas.

## 5. Fuera de alcance
Gating de "Ejecutar análisis" y timeline de carga (P5); limpieza de Settings/Patients (P6); traducción a español (P2). No tocar contratos ni backend.

## 6. Formato de devolución
```
### Revisión — FE-P1
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
Sidebar: cómo quedó el ruteo/activo por item; qué pantallas son propias ahora
Header: qué se removió (⌘K, badges, Run ID, campana); perfil menú + logout
Alineación header: cómo se resolvió
Pantallas nuevas con dato real vs estado vacío honesto:
a11y: violaciones nuevas (0 esperado)
Smoke test visual:
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
