# P10.5-D — Visor volumétrico estilo estación radiológica

## Estado

Especificación de implementación para la solución independiente de Enzo.

- Rama: `enzo/p10-5-d-radiology-volume-viewer`
- Base: `ea2d7c3541207765ae8415f86798035e2a21348b`
- No modificar `main`.
- No depender de ramas de Francisco.
- No abrir PR ni mergear mientras el ticket esté en desarrollo.

## Objetivo

Reemplazar el workspace actual de revisión por una experiencia visual más cercana a una estación radiológica moderna, conservando los límites reales del MVP:

- navegación completa del stack sagital y axial;
- catálogo de series y thumbnails;
- visores oscuros con toolbar técnica;
- overlay y resultados vinculados al slice seleccionado;
- revisión profesional persistente;
- reapertura desde Backend/PostgreSQL;
- comunicación exclusiva con Backend;
- sin diagnóstico automático ni claims clínicos no validados.

La inspiración visual es una estación radiológica de escritorio con:

1. barra superior de herramientas;
2. navegador de series a la izquierda;
3. uno o dos viewports centrales;
4. panel derecho de resultados/revisión;
5. barra de estado inferior;
6. fondo oscuro, separación clara de paneles y jerarquía tipográfica compacta.

No copiar marcas, nombres ni textos de productos externos. Implementar un diseño propio coherente con el sistema PFI.

## Alcance por ticket

### P10.5-D — visor y navegación

Implementar:

- tipos canónicos para catálogo de slices;
- adapter real y compatibilidad legacy;
- nuevo view-model volumétrico;
- navegación por rueda, teclado, slider y thumbnails;
- zoom, pan, fit, inversión y reset;
- opacidad y visibilidad de overlay;
- layouts 1x1 y 2x1;
- estado independiente por plano;
- placeholders `loading`, `missing`, `rejected` y `no preview`;
- preload del slice anterior y siguiente;
- responsive de escritorio y tablet horizontal;
- accesibilidad básica.

### P10.5-E-FE — resultados por slice

Sobre la rama final de D:

- filtrar mediciones y landmarks por `measurementIds`/`landmarkIds`;
- mostrar overlay solo si `hasResults=true`;
- mostrar `Sin resultados automáticos en este corte` para `no_automatic_results`;
- mostrar advertencia técnica para `degraded_inconsistent_result_references`;
- navegar desde una medición o landmark al `plane + sliceIndex` contractual;
- mostrar correcciones profesionales del slice seleccionado;
- guardar correcciones con `measurementId`, `plane`, `sliceIndex`, `beforeValue`, `afterValue` y `comment`.

### P10.5-F2 — E2E visual

Sobre la rama final de E-FE:

- carga ZIP por Backend;
- ejecución `real_baseline` con `allowContractFallback=false`;
- navegación 1..N;
- resultados correctos por slice;
- revisión y guardado;
- cierre/reapertura;
- assets servidos por Backend;
- Playwright con API real y `VITE_USE_MOCK=false`.

## Contratos Backend vigentes

### Carga de estudio

```text
POST /api/ai/studies
Content-Type: multipart/form-data
Authorization: Bearer <JWT>
```

Partes:

- `file`: ZIP del estudio;
- `caseId`: identificador pseudónimo.

Respuesta pública:

```ts
type StudyUploadResponse = {
  caseId: string;
  studyId: string;
  seriesFound: Array<{
    plane: string;
    description: string;
    weighting: string;
    sliceCount?: number;
  }>;
  sagittal?: {
    inputId: string;
    plane: string;
    format: string;
    size: number;
    description: string;
    weighting: string;
    sliceCount?: number;
  };
  axial?: {
    inputId: string;
    plane: string;
    format: string;
    size: number;
    description: string;
    weighting: string;
    sliceCount?: number;
  };
  warnings: string[];
  humanReviewRequired: boolean;
  notClinicalDiagnosis: boolean;
};
```

### Ejecución multiplanar

```text
POST /api/ai/multiplanar/run
```

```json
{
  "caseId": "CASO-PSEUDONIMO",
  "sagittalInputId": "inp_...",
  "axialInputId": "inp_...",
  "allowContractFallback": false,
  "metadata": {
    "inferenceMode": "real_baseline"
  }
}
```

Enviar solo los `inputId` realmente existentes. Nunca fabricar un plano ausente.

### Assets

```text
GET /api/ai/assets/{runId}/{plane}/{assetName}
```

El navegador no debe usar URLs directas del AI Module.

### Revisión

```text
POST /api/ai/runs/{runId}/review
```

### Reapertura

```text
GET /api/studies
GET /api/studies/{caseId}
GET /api/studies/{caseId}/runs
```

Al reabrir no relanzar inferencia.

## Modelo canónico esperado

Extender de forma aditiva el contrato actual.

```ts
type CanonicalSliceAsset = {
  assetName?: string;
  url?: string;
  contentType?: string;
  available?: boolean;
  storageStatus?: "stored" | "missing" | "rejected" | string;
  sha256?: string;
  sizeBytes?: number;
};

type CanonicalSliceCorrection = {
  measurementId?: string;
  plane?: string;
  sliceIndex?: number;
  beforeValue?: unknown;
  afterValue?: unknown;
  comment?: string;
  reviewer?: string;
  reviewedAt?: string;
};

type CanonicalSlice = {
  index: number;
  displayIndex: number;
  previewAsset?: CanonicalSliceAsset;
  overlayAsset?: CanonicalSliceAsset | null;
  hasResults: boolean;
  resultStatus?: string;
  measurementIds: string[];
  landmarkIds: string[];
  invalidMeasurementIds?: string[];
  duplicateMeasurementIds?: string[];
  invalidLandmarkIds?: string[];
  duplicateLandmarkIds?: string[];
  corrections?: CanonicalSliceCorrection[];
  correctionCount?: number;
};
```

Extender `CanonicalPlaneInput` con:

```ts
seriesId?: string;
sourceFormat?: string;
spacingXyzMm?: number[];
canonicalAxisSpacingMm?: number[];
originMm?: number[];
directionMatrix?: number[];
geometryComplete?: boolean;
slices?: CanonicalSlice[];
```

Compatibilidad de lectura:

1. preferir `plane.input.slices`;
2. aceptar `plane.metadata.slices` para presentación/legacy;
3. cuando `slices` no exista, construir una vista legacy de un solo corte sin inventar catálogo.

No reemplazar ni reutilizar `StudySeries`, `MriViewerSeries` o `CanonicalPlaneSeriesItem` para el nuevo catálogo. Crear tipos y view-model específicos.

## Arquitectura de componentes

Estructura sugerida:

```text
src/features/volumeViewer/
  contracts.ts
  volumeViewerAdapter.ts
  volumeViewerSelectors.ts
  volumeViewerState.ts
  useVolumeViewerController.ts
  assetUrl.ts
  preload.ts
  components/
    RadiologyWorkspace.tsx
    RadiologyToolbar.tsx
    SeriesRail.tsx
    SeriesThumbnail.tsx
    VolumeViewport.tsx
    SliceCanvas.tsx
    SliceNavigator.tsx
    ResultsPanel.tsx
    MeasurementsTable.tsx
    ReviewPanel.tsx
    ViewerStatusBar.tsx
    EmptySliceState.tsx
```

No concentrar nuevamente toda la funcionalidad dentro de `StudyReviewView.tsx`.

`StudyReviewView.tsx` debe transformarse gradualmente en un orquestador, no seguir creciendo como componente monolítico.

## Composición visual

### Shell

- fondo general casi negro;
- paneles carbón con bordes sutiles;
- acento cian/azul del producto;
- tipografía compacta y legible;
- densidad profesional, sin tarjetas gigantes;
- radios pequeños;
- sombras mínimas;
- estados de foco visibles.

### Barra superior

Controles permitidos:

- cursor/selección;
- pan;
- zoom;
- fit;
- inversión;
- reset;
- overlay visible;
- opacidad;
- layout 1x1 / 2x1;
- selector de plano/serie;
- ayuda de atajos.

No mostrar herramientas de medición libre, anotación, DICOM-SEG o DICOM-SR como funcionales si todavía no están implementadas y validadas.

### Panel izquierdo

Mostrar series reales devueltas por el contrato:

- Sagital T1/T2 cuando existan;
- Axial T2 cuando exista;
- cantidad de cortes;
- ponderación;
- plano;
- estado `stored/missing/rejected`;
- thumbnail del slice seleccionado o representativo.

Nunca usar series demo cuando `VITE_USE_MOCK=false`.

### Viewports

Cada viewport debe mostrar:

- plano/serie;
- `displayIndex / sliceCount`;
- preview autenticado;
- overlay del mismo slice;
- indicador de zoom;
- orientación solo si existe metadata confiable;
- loading y error seguros;
- navegación por rueda sin desplazar la página;
- drag para pan;
- doble clic para fit/reset razonable.

Layout 2x1:

- sagital y axial simultáneos;
- estados de navegación independientes;
- sin crosshair espacial mientras `geometryComplete !== true`.

### Panel derecho

Tabs sugeridas:

- `Resultados`;
- `Revisión`;
- `Trazabilidad`.

Resultados:

- tabla compacta;
- medición, nivel, valor IA, valor revisor, unidad, estado;
- selección de fila navega al slice contractual;
- filtro `corte actual / todo el stack`;
- no interpretar arrays `invalid*` como resultados clínicos.

Revisión:

- estado pendiente/observado/aceptado/descartado;
- correcciones del slice;
- observaciones;
- guardar borrador;
- aprobar/observar según permisos existentes.

Trazabilidad:

- runId abreviado;
- modo de inferencia;
- modelo/versión/hash abreviado;
- estado de assets;
- mensaje asistivo y no diagnóstico.

### Barra inferior

- estado de servicio;
- plano y corte actual;
- zoom;
- overlay on/off;
- advertencias no invasivas;
- sin reloj decorativo ni información falsa.

## Interacciones

### Navegación

- rueda: anterior/siguiente;
- flechas: anterior/siguiente;
- Home/End: primero/último;
- PageUp/PageDown: salto configurable;
- slider: acceso directo;
- thumbnail: acceso directo;
- indicador visual 1-based;
- estado interno 0-based.

No permitir índice fuera de rango.

### Controles de imagen

Sobre PNG se permiten:

- zoom;
- pan;
- fit;
- inversión;
- brillo/contraste visual aproximado;
- reset.

No rotular brillo/contraste sobre PNG como Window/Level clínico real. Usar `Brillo/contraste` o `Ajuste visual` hasta contar con pixels adecuados.

### Overlay

- combinar preview y overlay como capas separadas;
- opacidad 0..100%;
- ocultar overlay cuando `hasResults=false`;
- no reutilizar overlay de otro slice;
- si asset falta o fue rechazado, mostrar estado explícito.

### Cache

- preload anterior y siguiente;
- cancelar requests obsoletos;
- no descargar el stack completo de PNG en el primer render;
- cache acotada por URL;
- limpiar URLs/estado al cambiar de estudio.

## Seguridad y privacidad

- JWT mediante los helpers actuales;
- nunca token en query string;
- assets solo vía Backend;
- no renderizar rutas internas;
- no loguear respuestas médicas completas;
- no mostrar PatientName/PatientID de DICOM;
- usar identificadores pseudónimos;
- mantener `humanReviewRequired` y `notClinicalDiagnosis` visibles en contexto.

## Estados obligatorios

- carga inicial;
- carga de asset;
- asset almacenado;
- asset faltante;
- asset rechazado;
- error de autorización;
- Backend no disponible;
- sin plano axial;
- sin catálogo legacy;
- slice sin resultados;
- resultado degradado por referencias inconsistentes;
- revisión guardando/guardada/error.

## Accesibilidad

- botones con `aria-label`;
- tooltips;
- navegación por teclado;
- foco visible;
- contraste suficiente;
- `aria-live` para cambio de slice y errores;
- no depender solo del color;
- áreas clickeables mínimas de 36px en escritorio.

## Responsive

Objetivo primario: escritorio 1440px o superior.

- >= 1280px: rail + 2 viewports + panel de resultados;
- 1024–1279px: rail colapsable, un viewport prioritario, panel derecho ajustable;
- menor: modo revisión simplificado, sin prometer experiencia diagnóstica móvil.

## Fuera de alcance inmediato

- crosshair espacial sin geometría completa;
- reconstrucción 3D anatómica real;
- DICOM-SEG;
- DICOM-SR;
- herramientas clínicas de medición libre;
- probabilidades de lesión;
- interpretación diagnóstica;
- modificación de Backend/AI desde esta rama;
- merge a `main`.

## Tests P10.5-D

Agregar scripts y pruebas para:

1. parsear catálogo v2;
2. compatibilidad legacy;
3. no inventar slices;
4. índices 0-based y display 1-based;
5. wheel;
6. flechas;
7. Home/End;
8. slider;
9. thumbnails;
10. zoom/pan/fit/reset;
11. inversión;
12. opacidad;
13. overlay ausente;
14. asset missing/rejected;
15. navegación independiente por plano;
16. no crosshair sin geometría;
17. no llamada directa al AI Module;
18. URLs autenticadas por Backend;
19. responsive mínimo;
20. accesibilidad básica.

Comandos mínimos:

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Agregar:

```text
test:p10-5-d-contract
test:p10-5-d-viewer
test:e2e:p10-5-d
```

## Criterios de aceptación P10.5-D

- todos los slices reales son navegables;
- no se recarga el estudio al cambiar de slice;
- preview correcto por índice;
- overlay correcto o estado explícito;
- teclado y rueda funcionan;
- layout oscuro profesional;
- no se agregan funciones clínicas falsas;
- no se llama al AI Module desde navegador;
- build y tests verdes;
- capturas desktop 1x1 y 2x1;
- `main` intacta.

## Estrategia de ramas

1. `enzo/p10-5-d-radiology-volume-viewer`
   - visor, contrato, adapter, view-model y navegación.
2. `enzo/p10-5-e-slice-results-frontend`
   - crear desde el SHA final aprobado de D.
3. `enzo/p10-5-f2-frontend-e2e`
   - crear desde el SHA final aprobado de E-FE.

No acumular los tres cierres en un commit único. No modificar `main` durante el desarrollo.