import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";
import { startAuthenticatedImageLoad, useAuthenticatedImageUrl } from "../authenticatedAssets";
import { displayLandmarkLabel, displayStructureLabel } from "../clinicalDisplay";
import { paintSegmentation, type Segmentation } from "../features/reading/segmentation";
import { applyWindow, defaultWindow, fetchSlicePixels, percentileWindow, slicePixelsUrl, type SlicePixelsMeta } from "../features/reading/pixels";
import { MeasurementLayer, type MeasurementFigure } from "../features/reading/MeasurementLayer";
import type { MeasurementKind } from "../features/reading/measurements";
import { spokenOrientation, type OrientationLabels } from "../features/reading/orientationMarkers";
import { scaleBarFor } from "../features/reading/scaleBar";
import type { MriViewerMask, MriViewerModel } from "../viewModels/mriViewerViewModel";

/**
 * Pure presentation component. Knows nothing about either source domain
 * (multiplanar canonical plane runs or the legacy single-plane study
 * pipeline) — only MriViewerModel (src/viewModels/mriViewerViewModel.ts).
 * Domain adapters (canonicalPlaneToMriViewerModel / studyRunToMriViewerModel)
 * are responsible for producing that model, including resolving and
 * sanitizing asset URLs.
 */

type ViewerMode = "pan" | "window";
type WindowPreset = {
  id: string;
  label: string;
  brightness: number;
  contrast: number;
};
type Size = {
  width: number;
  height: number;
};
type Point = {
  x: number;
  y: number;
};

/**
 * Navegación por cortes del stack.
 *
 * Es opcional: cuando no se pasa, la rueda sigue haciendo zoom, que es el
 * comportamiento que espera el flujo de análisis. Cuando se pasa, la rueda cambia
 * de corte —como en cualquier estación de lectura— y el zoom se mueve a Ctrl+rueda.
 */
export type SliceNavigation = {
  current: number;
  total: number;
  /** Corte que la IA analizó; el único con segmentación. */
  aiIndex: number;
  /** Si el corte actual tiene una imagen real disponible. */
  hasImage: boolean;
  /**
   * Previsualización del corte actual, cuando no es el analizado por la IA.
   * Indefinida en el corte de la IA, que se sigue mostrando con `input.png`
   * porque es la imagen sobre la que la superposición está alineada.
   */
  previewUrl?: string;
  /** Previsualización de cualquier corte, para precargar los vecinos. */
  previewUrlFor?: (index: number) => string | undefined;
  /** Salto absoluto: slider y botones. */
  onChange: (index: number) => void;
  /**
   * Desplazamiento relativo: rueda y teclado. Va aparte de onChange porque varios
   * eventos seguidos se procesan en el mismo tick de React y calcular el destino
   * con `current` (ya obsoleto) perdía pasos al scrollear rápido.
   */
  onStep: (delta: number) => void;
};

type Props = {
  model: MriViewerModel;
  selectedLandmarkId: string;
  onSelectLandmark: (landmarkId: string) => void;
  onMoveLandmark?: (landmarkId: string, point: Point) => void;
  onAddLandmark?: (point: Point) => void;
  onLandmarkAddComplete?: () => void;
  readonly?: boolean;
  /**
   * Edición de cotas, separada de la de landmarks.
   *
   * `readonly` gobernaba las tres cosas con una sola llave: landmarks, contornos
   * y cotas. Pero la que la enciende es "Editar landmark", un botón dentro de
   * "Edición avanzada" cuyo texto sólo habla de landmarks, así que arrastrar el
   * extremo de una medición estaba implementado y era indescubrible.
   *
   * Se separan porque el gesto es distinto: los landmarks son muchos puntos
   * chicos y sin un modo se mueven de un roce, mientras que una cota sólo
   * muestra tiradores cuando está seleccionada —seleccionarla ya es el acto
   * deliberado—. Sin valor propio cae en `readonly`, que es el de antes.
   */
  measurementsReadonly?: boolean;
  addMode?: boolean;
  /**
   * Modo de marcado del receso subarticular: un clic sobre el corte axial.
   *
   * Va aparte de `measureTool` y no como una `MeasurementKind` más porque no es una
   * medición: no produce un valor, no tiene unidad, no se recalcula al mover un tirador
   * y no se persiste con las mediciones del revisor. Lo único que comparte es que se
   * marca con un clic.
   */
  subarticularMode?: boolean;
  /** El punto marcado, con el tamaño del corte para poder pasarlo a píxeles del DICOM. */
  onSubarticularPoint?: (point: Point, frame: Size) => void;
  /**
   * Letras de orientación del paciente para el corte visible, o `null` si la serie no
   * declara su orientación. Se derivan afuera porque dependen del corte, no del visor.
   */
  orientation?: OrientationLabels | null;
  /**
   * Ventana y nivel actuales, ya formateados, cada vez que cambian.
   *
   * El valor se calculaba desde siempre pero vivia en `.viewer-caption`, que la sala de
   * lectura oculta por CSS: el medico no tenia como saber con que ventana estaba
   * mirando. Se reporta hacia afuera en vez de dibujarlo aca porque su lugar es la
   * esquina de parametros de display, que la arma el viewport.
   */
  onDisplayParamsChange?: (label: string) => void;
  /** Espaciado del pixel en mm, para la barra de escala. Sin esto no se dibuja. */
  pixelSpacingMm?: [number, number] | null;
  overlayEnabled?: boolean;
  overlayOpacity?: number;
  onOverlayAvailableChange?: (available: boolean) => void;
  slice?: SliceNavigation;
  /** Herramienta de medición: activa el trazado de dos puntos sobre la imagen. */
  /** Herramienta de medición activa, o null. Cada tipo pide su cantidad de puntos. */
  measureTool?: MeasurementKind | null;
  /** Puntos ya marcados de la figura en curso, para dibujarla mientras se traza. */
  measureDraft?: Point[];
  /**
   * Un punto nuevo de la figura en curso.
   *
   * Las intensidades del corte viajan con el punto porque las herramientas de señal
   * las necesitan y viven acá: son el mismo arreglo que ya se descargó para
   * ventanear, y volver a pedirlas desde afuera sería descargar dos veces lo mismo.
   */
  onMeasurePoint?: (point: Point, frame: Size, pixels: RawSlicePixels | null) => void;
  /** Trazo libre cerrado: el ROI no termina por cantidad de clics sino al soltar. */
  onMeasureFreehand?: (points: Point[], frame: Size, pixels: RawSlicePixels | null) => void;
  /** Anotaciones ya trazadas que corresponden al corte visible. */
  annotations?: MeasurementOverlay[];
  /**
   * Segmentos de las mediciones de la IA, con sus dos extremos reales.
   *
   * Le dan un lugar al número: sin esto la tabla dice "37.37 mm" y el médico no
   * tiene cómo saber de dónde a dónde se midió, ni verificarlo, ni corregirlo.
   */
  aiMeasurements?: MeasurementOverlay[];
  /** Cuántas mediciones dibujables tiene la corrida, con o sin nivel seleccionado. */
  aiMeasurableCount?: number;
  /**
   * Dónde corta el otro plano a esta imagen, ya resuelto en la base 0..256.
   *
   * Llega calculada y no como geometría cruda: decidir si se puede trazar es una
   * verificación con reglas propias, y repartirla entre el visor y quien la consulta
   * la haría divergir.
   */
  referenceLine?: [Point, Point] | null;
  /** Por qué no se traza, cuando no se puede. Se dice en vez de callar. */
  referenceLineReason?: string;
  /**
   * Mediciones derivadas de la geometría de otras estructuras: ángulo segmentario y
   * listesis. Van en su propia capa, apagada por defecto, porque el modelo no fue
   * entrenado para producirlas y usarlas es una decisión del médico.
   */
  derivedMeasurements?: MeasurementOverlay[];
  derivedMeasurableCount?: number;
  /** Arrastrar un extremo de una medición de la IA la corrige. */
  onMoveMeasurePoint?: (measurementId: string, end: "from" | "to", point: Point, frame: Size) => void;
  /** Medición elegida: es la única que muestra tiradores y se puede arrastrar. */
  selectedMeasurementId?: string | null;
  /** Medición señalada desde el panel, para saber cuál fila es cuál línea. */
  highlightedMeasurementId?: string | null;
  onSelectMeasurement?: (id: string) => void;
  onMeasure?: (from: Point, to: Point, frame: Size) => void;
  onMeasureComplete?: () => void;
  /**
   * Corrección del contorno de una instancia por parte del revisor.
   *
   * Es lo que convierte a la segmentación en una propuesta: la IA dibuja, el
   * médico corrige el punto que está mal y lo que queda registrado es su versión.
   */
  onMoveMaskPoint?: (maskId: string, pointIndex: number, point: Point) => void;
  /** Mapa de instancias del corte inferido. El visor lo pinta; el backend no. */
  segmentation?: Segmentation;
  /** Índices de instancia que el revisor ocultó. */
  hiddenInstances?: number[];
  /**
   * Metadatos de los cortes crudos. Cuando llegan, la imagen se renderiza desde
   * las intensidades originales y el W/L pasa a ser ventaneo real en vez de un
   * filtro de brillo sobre un PNG ya ventaneado.
   */
  slicePixels?: SlicePixelsMeta;
  /** URL del corte inferido, de la que se derivan las de los cortes crudos. */
  pixelsBaseUrl?: string;
};

/**
 * Figura dibujada sobre la imagen, en la base 0..256.
 *
 * Es el mismo tipo que consume la capa de cotas: el visor no reinterpreta la
 * geometría, solo decide qué figuras están visibles.
 */
export type MeasurementOverlay = MeasurementFigure;

/** Intensidades originales del corte visible, para las herramientas de señal. */
export type RawSlicePixels = { data: Int16Array; meta: { width: number; height: number } };

const neutralPreset: WindowPreset = { id: "neutral", label: "Neutral PNG", brightness: 100, contrast: 100 };
const customPreset: WindowPreset = { id: "custom", label: "Personalizado", brightness: 100, contrast: 100 };
export const initialLandmarksVisible = false;
export const initialOverlayOpacity = 0.65;
const windowPresets: WindowPreset[] = [
  neutralPreset,
  { id: "soft", label: "Tejido blando aprox.", brightness: 108, contrast: 118 },
  { id: "bone", label: "Hueso aprox.", brightness: 96, contrast: 138 },
  customPreset,
];

/**
 * Presets de ventana sobre las intensidades originales.
 *
 * Van por percentiles del corte y no llevan nombre de tejido: la resonancia no está
 * calibrada como la TC, así que un "hueso 300/1500" fijo no significa lo mismo en dos
 * equipos. Ver `percentileWindow` para el razonamiento completo.
 */
const rawWindowPresets: { id: string; label: string; low: number; high: number; hint: string }[] = [
  { id: "full", label: "Rango completo", low: 0, high: 1, hint: "Todo el rango de intensidades del corte." },
  { id: "p2", label: "Contraste medio", low: 0.02, high: 0.98, hint: "Recorta el 2% de cada cola del histograma." },
  { id: "p10", label: "Alto contraste", low: 0.1, high: 0.9, hint: "Recorta el 10% de cada cola: separa mejor tejidos parecidos." },
];

export function computeFitZoom(frame: Size, image: Size) {
  if (frame.width <= 0 || frame.height <= 0 || image.width <= 0 || image.height <= 0) return 1;
  return Math.min(frame.width / image.width, frame.height / image.height);
}

export function formatZoomPercent(zoom: number, fitZoom: number) {
  if (fitZoom <= 0) return "100%";
  return `${Math.round(zoom / fitZoom * 100)}%`;
}

export function neutralWindowLevel() {
  return { brightness: neutralPreset.brightness, contrast: neutralPreset.contrast, presetId: neutralPreset.id };
}

export function manualWindowLevel(brightness: number, contrast: number, dx: number, dy: number) {
  return {
    brightness: clamp(brightness - dy * 0.65, 45, 180),
    contrast: clamp(contrast + dx * 0.65, 45, 220),
    presetId: customPreset.id,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pointPercent(value: number) {
  return clamp(value, 0, 256) / 256 * 100;
}

function maskFallbackColor(group: string | undefined) {
  if (group === "Grupo vertebral") return "var(--mask-vertebral-body)";
  if (group === "Canal") return "var(--mask-spinal-canal)";
  if (group === "Grupo discal") return "var(--mask-disc)";
  return "var(--mask-foramen-other-soft-tissue)";
}

export function maskGroups(masks: MriViewerMask[]) {
  const groups = new Map<string, { id: string; label: string; color: string; technicalName: string }>();
  masks.forEach((mask) => {
    // El nombre técnico se traduce igual que en la leyenda de instancias. Sin esto
    // el axial mostraba `raw_50`, `raw_100`… porque esas clases no traen `groupName`
    // y el identificador crudo del artifact llegaba tal cual a la pantalla clínica.
    const label = displayStructureLabel(mask.groupName ?? mask.labelKey);
    if (!groups.has(label)) {
      groups.set(label, {
        id: mask.id,
        label,
        // `??` no cae con "": una máscara canónica sin color declarado llegaba con
        // cadena vacía y el cuadradito de la leyenda quedaba sin pintar.
        color: mask.color || maskFallbackColor(mask.groupName),
        technicalName: mask.labelKey,
      });
    }
  });
  return Array.from(groups.values());
}

/**
 * URL de la máscara de una clase, derivada de la del corte inferido.
 *
 * Vive en el mismo directorio de assets de la corrida, así que se reemplaza el
 * último segmento y nada más: no se arma una ruta nueva, de modo que el origen y
 * el prefijo `/api/...` que exige la política de origen quedan intactos.
 */
function classMaskUrl(inputUrl: string | undefined, className: string) {
  if (!inputUrl) return undefined;
  const separator = inputUrl.lastIndexOf("/");
  if (separator < 0) return undefined;
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(className)) return undefined;
  return `${inputUrl.slice(0, separator + 1)}mask-${className}.png`;
}

/**
 * Carga las máscaras por clase y dice si están todas disponibles.
 *
 * El control por clase solo se habilita cuando lo están: una corrida anterior a
 * este cambio no las tiene, y ofrecer un checkbox que no puede ocultar nada sería
 * repetir el problema que este cambio vino a resolver.
 */
function useClassMaskLayers(inputUrl: string | undefined, classNames: string[]) {
  const [layers, setLayers] = useState<Record<string, string>>({});
  const key = classNames.join("|");

  useEffect(() => {
    setLayers({});
    if (!inputUrl || !classNames.length) return;
    const cleanups = classNames.map((className) => {
      const url = classMaskUrl(inputUrl, className);
      if (!url) return () => {};
      return startAuthenticatedImageLoad(url, (result) => {
        if (result.state !== "loaded" || !result.url) return;
        setLayers((current) => (current[className] ? current : { ...current, [className]: result.url as string }));
      });
    });
    return () => cleanups.forEach((cleanup) => cleanup());
    // `classNames` se reconstruye en cada render; `key` es su contenido.
  }, [inputUrl, key]);

  return { layers, ready: classNames.length > 0 && classNames.every((name) => Boolean(layers[name])) };
}

function assetStorageMessage(hasUrl: boolean) {
  return hasUrl ? "Recurso visual declarado por backend." : "No existe un recurso visual para esta corrida.";
}

export function MriSliceViewer({
  model,
  selectedLandmarkId,
  onSelectLandmark,
  onMoveLandmark,
  onAddLandmark,
  onLandmarkAddComplete,
  readonly = true,
  measurementsReadonly,
  addMode = false,
  subarticularMode = false,
  onSubarticularPoint,
  orientation = null,
  onDisplayParamsChange,
  pixelSpacingMm = null,
  overlayEnabled = true,
  overlayOpacity = initialOverlayOpacity,
  onOverlayAvailableChange,
  slice,
  measureTool = null,
  measureDraft = [],
  onMeasurePoint,
  onMeasureFreehand,
  annotations = [],
  aiMeasurements = [],
  aiMeasurableCount = 0,
  referenceLine = null,
  referenceLineReason = "",
  derivedMeasurements = [],
  derivedMeasurableCount = 0,
  onMoveMeasurePoint,
  selectedMeasurementId,
  highlightedMeasurementId,
  onSelectMeasurement,
  onMeasure,
  onMeasureComplete,
  onMoveMaskPoint,
  segmentation,
  hiddenInstances,
  slicePixels,
  pixelsBaseUrl,
}: Props) {
  /*
   * Al recorrer la serie cada corte muestra su propia previsualización; solo el
   * corte que la IA analizó conserva input.png con su superposición. La máscara
   * no se arrastra a los demás cortes: existe únicamente para ese corte y
   * dibujarla sobre otro mostraría una segmentación que no le corresponde.
   */
  const onAiSlice = !slice || slice.current === slice.aiIndex;
  const inputUrl = onAiSlice
    ? model.assets.find((asset) => asset.assetName === "input.png")?.url
    : slice.previewUrl;
  const overlayUrl = onAiSlice ? model.assets.find((asset) => asset.assetName === "overlay.png")?.url : undefined;
  const inputAsset = useAuthenticatedImageUrl(inputUrl);
  const overlayAsset = useAuthenticatedImageUrl(overlayUrl);
  /*
   * Mientras el corte siguiente se descarga se mantiene visible el anterior, en
   * vez de vaciar el visor. Cambiar de corte no es un error ni una ausencia de
   * dato: parpadear al cartel de "verificando recurso" en cada paso hacía
   * ilegible el recorrido de la serie. El estado real se sigue reportando —si la
   * descarga falla, el cartel aparece— así que no se disfraza una falla de carga
   * como si la imagen estuviera lista.
   */
  // Primer punto del segmento en curso. Vive en estado y no en ref porque la
  // marca provisional tiene que dibujarse apenas se hace el primer clic.
  /* Trazo libre en curso: se acumula mientras el puntero está apretado. */
  const freehandRef = useRef<Point[] | null>(null);
  const [freehand, setFreehand] = useState<Point[]>([]);
  const measureDragRef = useRef<{ measurementId: string; end: "from" | "to" } | null>(null);
  /*
   * La segmentación se pinta acá, no llega pintada. `putImageData` escribe los
   * píxeles exactos del mapa de instancias: no hay interpolación ni contorno
   * reconstruido, así que lo que se ve es lo que el modelo produjo.
   */
  /*
   * Ventana real (centro/ancho) sobre las intensidades originales. Arranca cubriendo
   * todo el rango de la serie, que es lo único que el dato respalda sin suponer un
   * preset de tejido que esta corrida no informa.
   */
  const [windowLevel, setWindowLevel] = useState<{ center: number; width: number } | null>(null);
  /* Preset de ventana real. Convive con el del PNG, que es un filtro de brillo. */
  const [rawPresetId, setRawPresetId] = useState("full");
  /* Clases apagadas desde la leyenda. Se declara acá porque el pintado la necesita. */
  const [hiddenClasses, setHiddenClasses] = useState<string[]>([]);
  useEffect(() => {
    setWindowLevel(slicePixels ? defaultWindow(slicePixels) : null);
  }, [slicePixels]);

  const pixelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pixelsReady, setPixelsReady] = useState(false);
  /*
   * Las intensidades originales del corte, guardadas para medir señal sobre ellas.
   * Se conservan acá y no se vuelven a pedir: es el mismo arreglo que ya se descargó
   * para ventanear, y sobre el PNG ya ventaneado una media describiría cómo se ve la
   * imagen, no lo que el equipo midió.
   */
  const rawPixelsRef = useRef<Int16Array | null>(null);
  const pixelsUrl = slicePixels && pixelsBaseUrl
    ? slicePixelsUrl(pixelsBaseUrl, slice ? slice.current : 0)
    : undefined;

  useEffect(() => {
    setPixelsReady(false);
    if (!pixelsUrl || !slicePixels || !windowLevel) return;
    const controller = new AbortController();
    void fetchSlicePixels(pixelsUrl, controller.signal)
      .then((pixels) => {
        if (controller.signal.aborted) return;
        const canvas = pixelCanvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        canvas.width = slicePixels.width;
        canvas.height = slicePixels.height;
        context.putImageData(applyWindow(pixels, slicePixels.width, slicePixels.height, windowLevel.center, windowLevel.width), 0, 0);
        rawPixelsRef.current = pixels;
        setPixelsReady(true);
      })
      .catch(() => {
        // Se cae al PNG: es peor dejar el visor vacío que mostrar la imagen ya
        // ventaneada por el backend.
        if (!controller.signal.aborted) setPixelsReady(false);
      });
    return () => controller.abort();
  }, [pixelsUrl, slicePixels, windowLevel?.center, windowLevel?.width]);

  /*
   * Al cambiar de corte se recalcula el preset sobre los píxeles nuevos. Sin esto la
   * ventana del corte 0 se arrastraba por toda la serie, y los cortes de los extremos
   * —que tienen menos señal— salían casi negros.
   *
   * La comparación antes de escribir corta el ciclo: el efecto de arriba depende de
   * `windowLevel`, así que devolver un objeto nuevo con los mismos números lo volvería
   * a disparar para siempre.
   */
  useEffect(() => {
    if (!pixelsReady || rawPresetId === "custom") return;
    const preset = rawWindowPresets.find((item) => item.id === rawPresetId);
    const data = rawPixelsRef.current;
    if (!preset || !data || !slicePixels) return;
    const next = percentileWindow(data, slicePixels, preset.low, preset.high);
    setWindowLevel((current) => (current
      && Math.abs(current.center - next.center) < 0.5
      && Math.abs(current.width - next.width) < 0.5
      ? current
      : next));
  }, [pixelsReady, pixelsUrl, rawPresetId, slicePixels]);

  const segmentationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenKey = (hiddenInstances ?? []).join(",");
  useEffect(() => {
    const canvas = segmentationCanvasRef.current;
    if (!canvas || !segmentation) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = segmentation.width;
    canvas.height = segmentation.height;
    /*
     * Apagar una clase apaga sus instancias.
     *
     * `hiddenClasses` solo filtraba los contornos poligonales de `model.masks`, que no
     * son lo que se pinta: la segmentación sale del mapa de instancias. Así que
     * destildar "Grupo discal" no sacaba un solo disco de la pantalla y la leyenda de
     * clases parecía decorativa. Cada instancia declara su `classKey`, que es lo que
     * une las dos vistas.
     */
    const hidden = new Set(hiddenInstances ?? []);
    segmentation.instances
      // Se compara por el rótulo mostrado: la leyenda de clases guarda el `labelKey`
      // de la máscara y la instancia trae su `classKey`, y en algunas corridas son dos
      // nombres técnicos distintos para la misma estructura.
      .filter((instance) => hiddenClasses.some((name) => name === instance.classKey
        || displayStructureLabel(name) === displayStructureLabel(instance.classKey)))
      .forEach((instance) => hidden.add(instance.index));
    context.putImageData(paintSegmentation(segmentation, hidden), 0, 0);
    // `hiddenInstances` se reconstruye en cada render; `hiddenKey` es su contenido.
  }, [segmentation, hiddenKey, hiddenClasses]);

  const lastLoadedUrl = useRef<string | undefined>(undefined);
  if (inputAsset.state === "loaded" && inputAsset.url) lastLoadedUrl.current = inputAsset.url;
  const displayedInputUrl = inputAsset.state === "loading" ? lastLoadedUrl.current : inputAsset.url;
  const inputState = inputAsset.state === "loading" && lastLoadedUrl.current ? "loaded" : inputAsset.state;
  const overlayState = overlayAsset.state;

  /*
   * Precarga de los cortes contiguos.
   *
   * Recorrer una serie es ir de a un corte: cuando el médico llega al siguiente,
   * su imagen ya está en la caché y el cambio es instantáneo. Solo los vecinos
   * inmediatos —traer la serie entera pediría decenas de imágenes que quizás
   * nunca se miran.
   */
  useEffect(() => {
    if (!slice?.previewUrlFor) return;
    /*
     * Se precargan cuatro cortes hacia cada lado, no uno.
     *
     * Con un solo vecino había que pasar varias veces por la serie para que las
     * imágenes terminaran de aparecer: al mover el slider o al poner el cine, el salto
     * era siempre mayor que lo precargado y el corte llegaba después de mostrarse
     * vacío. Cuatro cubre un arrastre normal y el ritmo del cine sin pedir la serie
     * entera, que serían decenas de imágenes que quizás nunca se miran.
     */
    const RADIUS = 4;
    const cleanups = Array.from({ length: RADIUS * 2 }, (_, offset) => (offset < RADIUS
      ? slice.current - RADIUS + offset
      : slice.current + offset - RADIUS + 1))
      .filter((index) => index >= 0 && index < slice.total && index !== slice.aiIndex)
      .map((index) => slice.previewUrlFor?.(index))
      .filter((url): url is string => Boolean(url))
      .map((url) => startAuthenticatedImageLoad(url, () => undefined));
    return () => cleanups.forEach((cleanup) => cleanup());
    // `previewUrlFor` queda fuera de las dependencias a propósito: la construye el
    // contenedor en cada render, así que incluirla relanzaría la precarga en cada
    // pintado. Lo que decide qué precargar es el corte, y ese sí está acá.
  }, [slice?.current, slice?.total, slice?.aiIndex]);
  const [mode, setMode] = useState<ViewerMode>("pan");
  const [selectedPresetId, setSelectedPresetId] = useState(neutralPreset.id);
  const [brightness, setBrightness] = useState(neutralPreset.brightness);
  const [contrast, setContrast] = useState(neutralPreset.contrast);
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [frameSize, setFrameSize] = useState<Size>({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 });
  const [fitInitialized, setFitInitialized] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(overlayEnabled);
  const [overlayAlpha, setOverlayAlpha] = useState(overlayOpacity);
  const [landmarksVisible, setLandmarksVisible] = useState(initialLandmarksVisible);
  /*
   * Cada capa se prende y apaga sola. Con siete discos, cinco vértebras y seis
   * niveles de canal, dibujarlo todo junto tapa la anatomía que se está leyendo: el
   * ruido visual no es un detalle estético, esconde la imagen que hay que mirar.
   */
  const [aiMeasuresVisible, setAiMeasuresVisible] = useState(true);
  const [myMeasuresVisible, setMyMeasuresVisible] = useState(true);
  /* Apagada por defecto: son propuestas a evaluar, no parte de la lectura. */
  const [derivedVisible, setDerivedVisible] = useState(false);
  const [referenceVisible, setReferenceVisible] = useState(true);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; brightness: number; contrast: number; panX: number; panY: number; window?: { center: number; width: number } } | null>(null);
  const landmarkDragRef = useRef<string | null>(null);
  /* Instancia y vértice que se está arrastrando. */
  const contourDragRef = useRef<{ maskId: string; index: number } | null>(null);
  const [selectedContourId, setSelectedContourId] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const landmarks = model.landmarks;
  /*
   * Las de la IA van primero para que las del revisor queden encima: si se pisan, lo
   * que tiene que quedar legible es lo que el médico afirmó, no la propuesta.
   */
  const visibleMeasures: MeasurementFigure[] = [
    ...(aiMeasuresVisible ? aiMeasurements : []),
    ...(derivedVisible ? derivedMeasurements : []),
    ...(myMeasuresVisible ? annotations : []),
  ];
  const groups = useMemo(() => maskGroups(model.masks), [model.masks]);
  const classNames = useMemo(() => groups.map((group) => group.technicalName), [groups]);
  const classMasks = useClassMaskLayers(onAiSlice ? inputUrl : undefined, classNames);
  /*
   * Instancias con contorno propio que corresponden al corte visible. Solo el corte
   * que la IA analizo tiene segmentacion, asi que en los demas no se dibuja nada:
   * un contorno sobre otro corte marcaria anatomia que no es la que se midio.
   */
  const contours = useMemo(
    () => (onAiSlice ? model.masks.filter((mask) => (mask.points?.length ?? 0) >= 3 && !hiddenClasses.includes(mask.labelKey)) : []),
    [model.masks, onAiSlice, hiddenClasses],
  );
  const imageLoaded = inputState === "loaded";
  const overlayLoaded = overlayState === "loaded";
  const storageMessage = assetStorageMessage(Boolean(inputUrl));
  const canEditLandmarks = Boolean(imageLoaded && model.coordinateSpace && !readonly);
  /*
   * El contorno se corrige sobre el corte que la IA analizó: es el único donde la
   * segmentación existe, y mover un punto sobre otro corte estaría editando una
   * figura que no corresponde a esa imagen.
   */
  const canEditContours = Boolean(imageLoaded && !readonly && onAiSlice && onMoveMaskPoint);
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const filter = `brightness(${brightness}%) contrast(${contrast}%)`;
  const seriesName = model.plane === "sagittal" ? "Sagital" : "Axial";

  useEffect(() => {
    setOverlayVisible(overlayEnabled);
  }, [overlayEnabled]);

  useEffect(() => {
    onOverlayAvailableChange?.(overlayLoaded);
  }, [onOverlayAvailableChange, overlayLoaded]);

  useEffect(() => {
    setFitInitialized(false);
    setImageSize({ width: 0, height: 0 });
    setPan({ x: 0, y: 0 });
  }, [inputUrl]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const updateSize = () => setFrameSize({ width: frame.clientWidth, height: frame.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!imageLoaded || imageSize.width <= 0 || frameSize.width <= 0) return;
    const nextFit = computeFitZoom(frameSize, imageSize);
    setFitZoom(nextFit);
    if (!fitInitialized) {
      setZoom(nextFit);
      setPan({ x: 0, y: 0 });
      setFitInitialized(true);
    }
  }, [fitInitialized, frameSize, imageLoaded, imageSize]);

  function applyFit() {
    const nextFit = computeFitZoom(frameSize, imageSize);
    setFitZoom(nextFit);
    setZoom(nextFit);
    setPan({ x: 0, y: 0 });
    setFitInitialized(true);
  }

  function applyPreset(preset: WindowPreset) {
    if (preset.id === "custom") return;
    setSelectedPresetId(preset.id);
    setBrightness(preset.brightness);
    setContrast(preset.contrast);
  }

  function resetWindowLevel() {
    applyPreset(neutralPreset);
    setRawPresetId("full");
  }

  function resetView() {
    applyFit();
  }

  function boundedZoom(nextZoom: number) {
    const minZoom = Math.max(fitZoom * 0.3, 0.05);
    return clamp(Number(nextZoom.toFixed(3)), minZoom, fitZoom * 6);
  }

  function stepSlice(delta: number) {
    slice?.onStep(delta);
  }

  /**
   * Lo que la rueda necesita, y nada mas.
   *
   * Se tipa por forma en vez de atarlo al evento de React porque el mismo manejador
   * lo usa el listener nativo de abajo, y los dos coinciden en esto.
   */
  type WheelLike = { ctrlKey: boolean; metaKey: boolean; deltaY: number; preventDefault: () => void };

  function handleWheel(event: WheelLike) {
    /*
     * En una estación de lectura la rueda recorre el stack: es el gesto que más se
     * repite durante una lectura. El zoom pasa a Ctrl/⌘+rueda, que además es la
     * convención del navegador para acercar.
     */
    if (slice && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      stepSlice(event.deltaY > 0 ? 1 : -1);
      return;
    }
    if (!imageLoaded) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -0.08 : 0.08;
    setZoom((value) => boundedZoom(value + fitZoom * direction));
  }

  /*
   * El `wheel` se engancha a mano y no por `onWheel`.
   *
   * React registra `wheel` como pasivo en la raiz, y en un listener pasivo el
   * navegador ignora `preventDefault`. Con Ctrl+rueda eso significa que se hacia el
   * zoom de la pagina entera ademas del de la imagen -justo el gesto que este
   * manejador viene a reemplazar-, y sin Ctrl la pagina scrolleaba mientras avanzaba
   * el corte. Con el mouse se nota; con el trackpad casi no, porque manda deltas
   * chicos y el navegador los absorbe distinto.
   *
   * El manejador vive en una ref para que el listener no se vuelva a colgar en cada
   * render ni se quede con un `zoom` o un `slice` viejos.
   */
  const wheelHandler = useRef(handleWheel);
  wheelHandler.current = handleWheel;
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const listener = (event: globalThis.WheelEvent) => wheelHandler.current(event);
    frame.addEventListener("wheel", listener, { passive: false });
    return () => frame.removeEventListener("wheel", listener);
  }, []);

  function handleFrameKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!slice) return;
    const actions: Record<string, () => void> = {
      ArrowUp: () => stepSlice(-1),
      ArrowLeft: () => stepSlice(-1),
      ArrowDown: () => stepSlice(1),
      ArrowRight: () => stepSlice(1),
      PageUp: () => stepSlice(-5),
      PageDown: () => stepSlice(5),
      Home: () => slice.onChange(0),
      End: () => slice.onChange(Math.max(0, slice.total - 1)),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!imageLoaded || event.button !== 0) return;
    // Antes que las mediciones: mientras se marca el receso, el clic no mide ni panea.
    if (subarticularMode) {
      const point = pointFromEvent(event);
      if (point) onSubarticularPoint?.(point, imageSize);
      return;
    }
    if (measureTool === "roi") {
      const point = pointFromEvent(event);
      if (!point) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      freehandRef.current = [point];
      setFreehand([point]);
      return;
    }
    if (measureTool) {
      const point = pointFromEvent(event);
      if (point) onMeasurePoint?.(point, imageSize, rawPixels());
      return;
    }
    if (addMode) {
      createLandmark(event);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      brightness,
      contrast,
      // La ventana al empezar: el arrastre es relativo a ella, no acumulativo.
      window: windowLevel ?? undefined,
      panX: pan.x,
      panY: pan.y,
    };
  }

  /*
   * Arrastrar en modo W/L mueve centro y ancho de la ventana. Con datos crudos eso
   * es ventaneo: horizontal ensancha o angosta, vertical sube o baja el centro,
   * que es el gesto de cualquier PACS. Sin datos crudos sigue ajustando brillo y
   * contraste sobre el PNG, que es lo único que esa corrida permite.
   */
  function dragWindowLevel(dx: number, dy: number, base: { center: number; width: number }) {
    const span = slicePixels ? Math.max(1, slicePixels.max - slicePixels.min) : 1;
    setWindowLevel({
      center: base.center + dy * span * 0.002,
      width: Math.max(1, base.width + dx * span * 0.002),
    });
    setRawPresetId("custom");
  }

  /*
   * El preset se recalcula sobre el corte visible, no sobre el primero de la serie:
   * el rango de intensidades cambia entre cortes y una ventana heredada del corte 0
   * puede dejar el corte 8 casi en blanco.
   */
  function applyRawPreset(id: string) {
    const preset = rawWindowPresets.find((item) => item.id === id);
    const data = rawPixelsRef.current;
    if (!preset || !data || !slicePixels) return;
    setRawPresetId(id);
    setWindowLevel(percentileWindow(data, slicePixels, preset.low, preset.high));
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (freehandRef.current) {
      extendFreehand(event);
      return;
    }
    if (measureDragRef.current && onMoveMeasurePoint) {
      const point = pointFromEvent(event);
      const drag = measureDragRef.current;
      if (point) onMoveMeasurePoint(drag.measurementId, drag.end, point, imageSize);
      return;
    }
    if (contourDragRef.current && canEditContours) {
      const point = pointFromEvent(event);
      if (point) onMoveMaskPoint?.(contourDragRef.current.maskId, contourDragRef.current.index, point);
      return;
    }
    if (landmarkDragRef.current && canEditLandmarks) {
      const point = pointFromEvent(event);
      if (point) onMoveLandmark?.(landmarkDragRef.current, point);
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (mode === "window") {
      if (pixelsReady && drag.window) {
        dragWindowLevel(dx, dy, drag.window);
        return;
      }
      setSelectedPresetId(customPreset.id);
      setContrast(clamp(drag.contrast + dx * 0.65, 45, 220));
      setBrightness(clamp(drag.brightness - dy * 0.65, 45, 180));
      return;
    }
    setPan({ x: drag.panX + dx, y: drag.panY + dy });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    landmarkDragRef.current = null;
    measureDragRef.current = null;
    if (freehandRef.current) finishFreehand();
    contourDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  }

  function pointFromEvent(event: { clientX: number; clientY: number }): Point | null {
    const image = imageRef.current;
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width * 256, 0, 256),
      y: clamp((event.clientY - rect.top) / rect.height * 256, 0, 256),
    };
  }

  /*
   * Dos clics definen la medición: el primero fija el ancla y el segundo cierra el
   * segmento. Se entrega el tamaño del marco junto con los puntos porque la
   * conversión a milímetros necesita el alto y ancho reales de la imagen — la base
   * 0..256 es normalizada y por sí sola no dice cuántos píxeles hay de por medio.
   */
  /**
   * Acumula el trazo libre del ROI.
   *
   * Se descartan los puntos que caen a menos de un paso del anterior: un arrastre
   * lento genera cientos de puntos casi iguales, que engordan la anotación guardada
   * sin cambiar la figura ni el área.
   */
  function extendFreehand(event: { clientX: number; clientY: number }) {
    const current = freehandRef.current;
    if (!current) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const last = current[current.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < 1.5) return;
    current.push(point);
    setFreehand([...current]);
  }

  function rawPixels(): RawSlicePixels | null {
    const data = rawPixelsRef.current;
    if (!data || !slicePixels) return null;
    return { data, meta: { width: slicePixels.width, height: slicePixels.height } };
  }

  function finishFreehand() {
    const current = freehandRef.current;
    freehandRef.current = null;
    setFreehand([]);
    if (current && current.length >= 3) onMeasureFreehand?.(current, imageSize, rawPixels());
  }

  function createLandmark(event: { clientX: number; clientY: number }) {
    if (!addMode || !canEditLandmarks) return;
    const point = pointFromEvent(event);
    if (!point) return;
    onAddLandmark?.(point);
    onLandmarkAddComplete?.();
  }

  // La eleccion del escalon vive en scaleBar.ts, donde se puede probar.
  const scaleBar = useMemo(() => scaleBarFor({
    pixelSpacingMm,
    imageWidth: imageSize.width,
    sourceWidth: slicePixels?.width,
    zoom,
  }), [imageSize.width, pixelSpacingMm, slicePixels?.width, zoom]);

  /*
   * La ventana actual, hacia afuera. Es un dato de lectura, no de depuracion: sin verlo,
   * dos cortes que se ven distinto pueden estar iguales y solo cambio el ventaneo.
   */
  const displayParams = pixelsReady && windowLevel
    ? `W ${Math.round(windowLevel.width)} / L ${Math.round(windowLevel.center)}`
    : `W/L aprox. ${Math.round(contrast)} / ${Math.round(brightness)}`;
  useEffect(() => {
    onDisplayParamsChange?.(displayParams);
  }, [displayParams, onDisplayParamsChange]);

  return (
    <div className={`mri-viewer real-asset-viewer ${model.plane}`}>
      <div className="viewer-caption">
        <div>
          <strong>{seriesName}</strong>
          <span>{imageLoaded ? storageMessage : inputState === "failed" ? storageMessage : "Verificando recurso real"}</span>
        </div>
        <div className="dicom-meta">
          <em>{pixelsReady ? "Intensidades originales (16 bits)" : "PNG servido único"}</em>
          {/* Con datos crudos el número es la ventana real; sobre el PNG es un filtro. */}
          <em>{pixelsReady && windowLevel
            ? `W ${Math.round(windowLevel.width)} / L ${Math.round(windowLevel.center)}`
            : `W/L aprox. ${Math.round(contrast)} / ${Math.round(brightness)}`}</em>
          <em>Zoom {formatZoomPercent(zoom, fitZoom)}</em>
          {model.coordinateSpace && <em>{model.coordinateSpace}</em>}
        </div>
      </div>

      <div className="viewer-controls professional-viewer-controls" role="toolbar" aria-label="Controles del visor 2D">
        <label className="control-field">
          <span>Ventana/Nivel</span>
          {pixelsReady
            ? (
              <select
                aria-label="Preset de ventana y nivel"
                onChange={(event) => applyRawPreset(event.target.value)}
                title={rawWindowPresets.find((item) => item.id === rawPresetId)?.hint
                  ?? "Ventana ajustada a mano sobre las intensidades originales."}
                value={rawPresetId}
              >
                {rawWindowPresets.map((preset) => (
                  <option key={preset.id} title={preset.hint} value={preset.id}>{preset.label}</option>
                ))}
                <option disabled value="custom">Personalizado</option>
              </select>
            )
            : (
              <select aria-label="Preset de ventana y nivel" onChange={(event) => {
                const preset = windowPresets.find((item) => item.id === event.target.value);
                if (preset) applyPreset(preset);
              }} value={selectedPresetId}>
                {windowPresets.map((preset) => <option disabled={preset.id === "custom"} key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
            )}
        </label>
        <button className={mode === "window" ? "active" : ""} disabled={!imageLoaded} onClick={() => setMode("window")} type="button">Arrastrar W/L</button>
        <button className={mode === "pan" ? "active" : ""} disabled={!imageLoaded} onClick={() => setMode("pan")} type="button">Desplazar</button>
        <button disabled={!imageLoaded} onClick={() => setZoom((value) => boundedZoom(value - fitZoom * 0.2))} type="button">Alejar</button>
        <span className="zoom-readout">{formatZoomPercent(zoom, fitZoom)}</span>
        <button disabled={!imageLoaded} onClick={() => setZoom((value) => boundedZoom(value + fitZoom * 0.2))} type="button">Acercar</button>
        <button disabled={!imageLoaded} onClick={applyFit} type="button">Ajustar</button>
        <button disabled={!imageLoaded} onClick={resetView} type="button">Restablecer vista</button>
        <button disabled={!imageLoaded} onClick={resetWindowLevel} type="button">Restablecer W/L</button>
      </div>

      <div className="plane-controls-panel">
        <strong className="layers-title">Capas</strong>
        <label className="toggle-row">
          <input checked={overlayVisible} disabled={!overlayLoaded} onChange={(event) => setOverlayVisible(event.target.checked)} type="checkbox" />
          <span>Segmentación</span>
        </label>
        <label className="opacity-control">
          <span>Opacidad</span>
          <input aria-label="Opacidad de segmentación" disabled={!overlayLoaded} max="1" min="0" onChange={(event) => setOverlayAlpha(Number(event.target.value))} step="0.01" type="range" value={overlayAlpha} />
        </label>
        <label className="toggle-row" title={aiMeasurableCount ? "Se dibujan las del nivel que esté seleccionado en el panel de hallazgos" : "Esta corrida no guardó los extremos de sus mediciones"}>
          <input checked={aiMeasuresVisible} disabled={!aiMeasurableCount} onChange={(event) => setAiMeasuresVisible(event.target.checked)} type="checkbox" />
          <span>Mediciones IA{aiMeasurements.length ? ` (${aiMeasurements.length})` : ""}</span>
        </label>
        {/*
          Sin nivel seleccionado no se dibuja ninguna: treinta segmentos con su rótulo
          tapan la anatomía. Se dice por qué está vacío en vez de dejar la capa
          prendida sin efecto visible, que se lee como que no funciona.
        */}
        {aiMeasuresVisible && aiMeasurableCount > 0 && !aiMeasurements.length && (
          <p className="viewer-limit-note">Elegí un nivel en Hallazgos para ver sus mediciones sobre la imagen.</p>
        )}
        <label
          className="toggle-row"
          title={derivedMeasurableCount
            ? "Ángulo segmentario y listesis, calculados a partir de los ejes de dos vértebras vecinas. El modelo no fue entrenado para producirlas."
            : "Esta corrida no trae mediciones derivadas"}
        >
          <input checked={derivedVisible} disabled={!derivedMeasurableCount} onChange={(event) => setDerivedVisible(event.target.checked)} type="checkbox" />
          <span>Derivadas{derivedMeasurements.length ? ` (${derivedMeasurements.length})` : ""}<em> exp</em></span>
        </label>
        <label className="toggle-row">
          <input checked={myMeasuresVisible} disabled={!annotations.length} onChange={(event) => setMyMeasuresVisible(event.target.checked)} type="checkbox" />
          <span>Mis mediciones{annotations.length ? ` (${annotations.length})` : ""}</span>
        </label>
        <label className="toggle-row" title={referenceLine ? "Dónde corta el otro plano a esta imagen" : referenceLineReason || "No hay otro plano con el que cruzar"}>
          <input checked={referenceVisible} disabled={!referenceLine} onChange={(event) => setReferenceVisible(event.target.checked)} type="checkbox" />
          <span>Corte cruzado</span>
        </label>
        {!referenceLine && referenceLineReason && (
          <p className="viewer-limit-note">{referenceLineReason}</p>
        )}
        {/*
          Se deshabilita cuando no hay ninguno. Encendido sobre una capa vacía el
          control no cambia nada en pantalla y se lee como que está roto; el rótulo
          dice que no hay landmarks, que es distinto de que no se vean.
        */}
        <label className="toggle-row" title={landmarks.length ? undefined : "Esta corrida no generó landmarks."}>
          <input
            checked={landmarksVisible && landmarks.length > 0}
            disabled={landmarks.length === 0}
            onChange={(event) => setLandmarksVisible(event.target.checked)}
            type="checkbox"
          />
          <span>{landmarks.length ? `Landmarks (${landmarks.length})` : "Landmarks (ninguno)"}</span>
        </label>
      </div>

      {/*
        Plegable y cerrada de arranque. Las dos leyendas flotantes le comian cerca de
        un tercio del visor a la anatomia, que es justo lo que hay que mirar; se abren
        cuando hacen falta y el resto del tiempo ocupan una linea.
      */}
      <details className="segmentation-legend-panel">
        <summary>Leyenda de segmentación</summary>
        <div className="segmentation-legend-list">
          {groups.length ? groups.map((group) => (
            <label
              className="segmentation-class-control"
              key={group.id}
              title={classMasks.ready
                ? `Mostrar u ocultar ${group.label}. Clase técnica: ${group.technicalName}`
                : `Esta corrida no tiene máscara separada para esta clase. Clase técnica: ${group.technicalName}`}
            >
              <input
                checked={!hiddenClasses.includes(group.technicalName)}
                disabled={!classMasks.ready || !overlayVisible}
                onChange={(event) => setHiddenClasses((current) => (event.target.checked
                  ? current.filter((name) => name !== group.technicalName)
                  : [...current, group.technicalName]))}
                type="checkbox"
              />
              <span className="mask-swatch" style={{ background: group.color }} />
              <span>{group.label}</span>
            </label>
          )) : <span className="muted">Máscara por clase no informada.</span>}
        </div>
        {!classMasks.ready && groups.length > 0 && (
          <p className="viewer-limit-note">Esta corrida guardó la segmentación como una sola imagen compuesta, así que solo se puede mostrar u ocultar entera. Las corridas nuevas guardan una máscara por clase.</p>
        )}
      </details>

      {/*
        La nota decía que W/L era un filtro de brillo sobre un PNG de 8 bits y que el
        ventaneo real "requiere AI-009". Quedó obsoleta cuando pixels.ts empezó a
        ventanear sobre las intensidades originales de 16 bits: hoy solo es un filtro
        cuando la corrida no publicó los cortes crudos, y el propio visor ya lo distingue
        ("W/L aprox." contra "W 500 / L 250"). Se dice lo que sigue siendo cierto.
      */}
      {!pixelsReady && (
        <p className="viewer-limit-note">
          Esta corrida no publicó las intensidades originales: el W/L es un filtro de
          brillo y contraste sobre la imagen ya ventaneada, no ventaneo DICOM.
        </p>
      )}

      <div
        className={`real-slice-frame ${mode === "window" ? "window-mode" : "pan-mode"} ${addMode ? "landmark-add-mode" : ""} ${subarticularMode ? "subarticular-add-mode" : ""}`}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleFrameKeyDown}
        ref={frameRef}
        tabIndex={slice ? 0 : undefined}
        role={slice ? "group" : undefined}
        aria-label={slice ? `${seriesName}: corte ${slice.current + 1} de ${slice.total}. Rueda o flechas para recorrer el stack.` : undefined}
      >
        {/*
          Las letras de orientación del paciente, como en cualquier PACS.
          Van sobre los bordes y no en las esquinas, que ya están ocupadas por caso,
          serie, modelo y escala. Si la serie no declara su orientación no se dibuja
          ninguna: una letra inventada se lee igual de convincente que una correcta.
        */}
        {/*
          Barra de escala. La regla de un PACS: un numero de milimetros solo se puede
          juzgar contra algo. Se recalcula con el zoom, asi que sigue siendo verdad
          despues de acercar. Sin espaciado fisico no se dibuja: una barra sin escala
          real seria una regla mintiendo.
        */}
        {scaleBar && (
          <div className="rr-scalebar" aria-hidden="true" style={{ inlineSize: `${scaleBar.px}px` }}>
            <span>{scaleBar.mm} mm</span>
          </div>
        )}
        {orientation && (
          <div className="rr-orientation" aria-label={spokenOrientation(orientation)}>
            <span className="rr-orientation-l" aria-hidden="true">{orientation.left}</span>
            <span className="rr-orientation-r" aria-hidden="true">{orientation.right}</span>
            <span className="rr-orientation-t" aria-hidden="true">{orientation.top}</span>
            <span className="rr-orientation-b" aria-hidden="true">{orientation.bottom}</span>
          </div>
        )}
        {slice && !slice.hasImage ? (
          /*
           * Corte navegable sin imagen: hoy solo el corte analizado por la IA tiene
           * preview. Se dice explicitamente en vez de dejar el visor en blanco o,
           * peor, repetir la imagen de otro corte.
           */
          <div className="asset-empty-state">
            <strong>Corte {slice.current + 1} sin preview</strong>
            <span>El estudio conserva {slice.total} cortes, pero por ahora solo el corte {slice.aiIndex + 1} tiene imagen generada. El resto se navega sin superponer una imagen que no le corresponde.</span>
          </div>
        ) : inputState === "loaded" && displayedInputUrl ? (
          <div className="asset-transform" style={{ height: `${imageSize.height}px`, transform, width: `${imageSize.width}px` }}>
            {/*
              Cuando llegan las intensidades originales, la imagen se dibuja acá y el
              <img> queda solo como marco: sigue definiendo el tamaño natural sobre el
              que se posicionan landmarks y mediciones, pero no se ve.
            */}
            {pixelsReady && <canvas className="mri-pixel-canvas" ref={pixelCanvasRef} />}
            <img
              ref={imageRef}
              alt={`${seriesName} recurso de entrada`}
              className="mri-asset-img"
              draggable={false}
              onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              src={displayedInputUrl}
              style={{ filter: pixelsReady ? undefined : filter, opacity: pixelsReady ? 0 : 1 }}
            />
            {/*
              Una sola capa: el mapa de instancias pintado en el cliente.

              Antes se apilaban un PNG por clase servido por el backend y encima un
              contorno vectorial reconstruido. Eran dos representaciones de lo mismo,
              y la vectorial era una aproximación: unía puntos ordenados por ángulo,
              lo que sobre una forma no compacta dibuja una figura que la IA nunca
              segmentó. Cuando el mapa no viaja —corridas anteriores a este cambio—
              se cae al overlay compuesto, que es lo que esa corrida produjo.
            */}
            {overlayVisible && segmentation && onAiSlice ? (
              <canvas className="mri-segmentation-canvas" ref={segmentationCanvasRef} style={{ opacity: overlayAlpha }} />
            ) : overlayVisible && onAiSlice && overlayLoaded && overlayAsset.url ? (
              <img alt={`${seriesName} recurso de superposicion IA`} className="mri-overlay-img" draggable={false} src={overlayAsset.url} style={{ opacity: overlayAlpha, transform: "translateZ(0)" }} />
            ) : null}
            <MeasurementLayer
              referenceLine={referenceVisible ? referenceLine : null}
              editable={!(measurementsReadonly ?? readonly) && Boolean(onMoveMeasurePoint)}
              figures={visibleMeasures}
              draft={measureTool && (measureDraft.length > 0 || freehand.length > 0)
                ? { kind: measureTool, points: freehand.length ? freehand : measureDraft }
                : null}
              highlightedId={highlightedMeasurementId ?? null}
              onDragStart={(event, measurementId, index) => {
                event.stopPropagation();
                measureDragRef.current = { measurementId, end: index === 0 ? "from" : "to" };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onSelect={onSelectMeasurement}
              selectedId={selectedMeasurementId ?? null}
              zoom={zoom}
            />
            {landmarksVisible && landmarks.map((landmark) => {
              const displayLabel = displayLandmarkLabel(landmark.labelKey);
              const selected = selectedLandmarkId === landmark.id;
              return (
                <button
                  aria-label={`Punto de referencia ${displayLabel}`}
                  className={`asset-landmark ${selected ? "selected" : ""}`}
                  key={landmark.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectLandmark(landmark.id);
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectLandmark(landmark.id);
                    if (!canEditLandmarks || event.button !== 0) return;
                    landmarkDragRef.current = landmark.id;
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  style={{ left: `${pointPercent(landmark.x)}%`, top: `${pointPercent(landmark.y)}%` }}
                  title={displayLabel}
                  type="button"
                >
                  {selected && <span>{displayLabel}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="asset-empty-state">
            <strong>{inputState === "failed" ? "Imagen no disponible desde backend" : "Verificando input.png real"}</strong>
            <span>{storageMessage} No se renderiza una resonancia simulada. El visor espera el recurso real `input.png` de la corrida de plano.</span>
          </div>
        )}
      </div>

      <div className="viewer-footer real-viewer-footer">
        <span>{overlayLoaded ? "overlay.png disponible" : overlayState === "failed" ? "overlay.png no disponible" : "superposición pendiente"}</span>
        <span>{overlayVisible && overlayLoaded ? `${Math.round(overlayAlpha * 100)}% opacidad` : "Segmentación IA deshabilitada si falta el recurso"}</span>
        <span>{landmarksVisible ? `${landmarks.length} puntos visibles` : "Puntos de referencia ocultos"}</span>
        <span>{!readonly && canEditLandmarks ? "Edicion de landmarks del revisor" : "Corte unico servido"}</span>
      </div>
      {overlayState === "failed" && <div className="panel-hidden-placeholder">overlay.png no disponible desde backend. Se muestra input.png sin superposición simulada.</div>}
      {!model.coordinateSpace && <div className="panel-hidden-placeholder">Espacio de coordenadas no informado por backend; mover/agregar landmarks queda deshabilitado para no inventar model_256/original.</div>}
      {model.coordinateSpace && !readonly && <div className="panel-hidden-placeholder">Correcciones de landmarks en borrador local no persistido. Pendiente BE-008/FE-010 + AI-011.</div>}
    </div>
  );
}
