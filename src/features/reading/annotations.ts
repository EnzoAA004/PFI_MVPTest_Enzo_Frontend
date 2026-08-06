import type { SpineLevel } from "../../clinicalDisplay";

/**
 * Anotaciones del revisor sobre un estudio.
 *
 * El alcance es explícito porque los médicos entrevistados describieron dos usos
 * distintos que la misma herramienta tiene que soportar: una impresión que vale
 * para todo el estudio, y una medición tomada sobre un corte puntual que solo
 * tiene sentido en ese corte. Modelarlos con un campo `scope` en vez de con tres
 * listas separadas evita que la anotación quede huérfana de su contexto.
 */
export type AnnotationScope = "study" | "level" | "slice";

export type AnnotationKind = "measurement" | "marker" | "note";

/**
 * Qué se midió, dentro de las anotaciones de tipo medición.
 *
 * Va aparte de `kind` porque son dos preguntas distintas: `kind` dice si la
 * anotación es una medición, una marca o una nota —y es lo que la base restringe—
 * mientras que esto dice con qué herramienta se tomó. Sin este dato, al recargar
 * un ángulo se redibujaría como una distancia entre sus dos primeros puntos.
 */
export type AnnotationMeasurementKind = "distance" | "angle" | "listhesis" | "roi" | "probe";

export type AnnotationPoint = { x: number; y: number };

export type Annotation = {
  id: string;
  scope: AnnotationScope;
  kind: AnnotationKind;
  /** Con qué herramienta se tomó, cuando `kind` es "measurement". */
  measurementKind?: AnnotationMeasurementKind;
  /** Requerido si scope = "slice": identifica la serie y el corte exactos. */
  plane?: "sagittal" | "axial";
  seriesId?: string;
  sliceIndex?: number;
  /** Requerido si scope = "level". */
  level?: SpineLevel;
  /**
   * Geometría en el mismo espacio 0..256 que usan máscaras y landmarks: es una
   * base normalizada al marco de la imagen, no píxeles del PNG, así que sigue
   * alineada aunque el corte se muestre a otra resolución.
   */
  points?: AnnotationPoint[];
  /** Magnitud medida. `unit` es "mm" solo si la corrida informó spacing físico. */
  value?: number;
  unit?: "mm" | "px";
  text?: string;
  author: string;
  createdAt: string;
};

/** Contexto de lo que el revisor está mirando ahora mismo. */
export type AnnotationContext = {
  plane: "sagittal" | "axial";
  seriesId?: string;
  sliceIndex: number;
  level?: SpineLevel | null;
};

/**
 * Si una anotación corresponde a lo que se está viendo.
 *
 * Una anotación de corte solo se dibuja sobre su corte: mostrarla en otro sería
 * ubicar una medición sobre anatomía que no es la que se midió. Las de nivel
 * cruzan sagital y axial —el nivel es la misma referencia en ambos planos— y las
 * de estudio no se dibujan sobre la imagen, se listan aparte.
 */
export function isAnnotationVisible(annotation: Annotation, context: AnnotationContext): boolean {
  if (annotation.scope === "study") return false;
  if (annotation.scope === "level") return Boolean(annotation.level) && annotation.level === context.level;
  return (
    annotation.plane === context.plane
    && annotation.sliceIndex === context.sliceIndex
    && (!annotation.seriesId || !context.seriesId || annotation.seriesId === context.seriesId)
  );
}

/** Índices de corte de un plano que tienen alguna anotación anclada. */
export function annotatedSlices(annotations: Annotation[], plane: "sagittal" | "axial"): Set<number> {
  const marked = new Set<number>();
  for (const annotation of annotations) {
    if (annotation.scope !== "slice" || annotation.plane !== plane) continue;
    if (typeof annotation.sliceIndex === "number") marked.add(annotation.sliceIndex);
  }
  return marked;
}

/**
 * Distancia entre dos puntos, en milímetros cuando la corrida informó el tamaño
 * físico del píxel y en píxeles cuando no.
 *
 * `spacingMm` viene como [alto, ancho] del píxel, que es el orden en que el AI
 * Module publica `inPlaneSpacingMm`, y los ejes pueden tener tamaños distintos:
 * escalar cada componente por separado antes de la norma es lo que hace que la
 * medida sea física y no una diagonal en píxeles disfrazada de milímetros. Sin
 * spacing se devuelve "px" y quien lo muestre debe decirlo, nunca rotularlo mm.
 */
export function measureDistance(
  from: AnnotationPoint,
  to: AnnotationPoint,
  frame: { width: number; height: number },
  spacingMm?: number[] | null,
): { value: number; unit: "mm" | "px" } {
  // Los puntos vienen en la base 0..256; se llevan al marco real antes de aplicar
  // el spacing, porque esa base no es cuadrada salvo que la imagen lo sea.
  const dxPixels = (to.x - from.x) / 256 * frame.width;
  const dyPixels = (to.y - from.y) / 256 * frame.height;
  const rowSpacing = spacingMm?.[0];
  const colSpacing = spacingMm?.[1];
  if (typeof rowSpacing !== "number" || typeof colSpacing !== "number" || rowSpacing <= 0 || colSpacing <= 0) {
    return { value: Math.hypot(dxPixels, dyPixels), unit: "px" };
  }
  return { value: Math.hypot(dxPixels * colSpacing, dyPixels * rowSpacing), unit: "mm" };
}

export function formatMeasurement(value: number, unit: "mm" | "px") {
  return `${value.toFixed(unit === "mm" ? 1 : 0)} ${unit}`;
}

/** Rótulo del alcance para la lista de anotaciones. */
export function displayAnnotationScope(annotation: Annotation) {
  if (annotation.scope === "study") return "Todo el estudio";
  if (annotation.scope === "level") return annotation.level ?? "Nivel";
  return `Corte ${(annotation.sliceIndex ?? 0) + 1}`;
}

/**
 * Landmarks del revisor, guardados como anotaciones de tipo `marker`.
 *
 * Los landmarks se editaban y se perdían al recargar: vivían solo en el estado de la
 * sesión. La tabla de anotaciones ya acepta `kind: "marker"` con plano, corte y
 * puntos, que es exactamente un landmark, así que persisten por ahí sin inventar un
 * almacenamiento nuevo ni tocar el backend.
 *
 * El identificador se conserva tal cual para que un landmark corregido dos veces
 * sobrescriba el suyo en vez de acumular copias.
 */
export type MarkerLandmark = {
  id: string;
  label: string;
  seriesId: string;
  sliceIndex: number;
  x: number;
  y: number;
};

export function landmarkToAnnotation(
  landmark: MarkerLandmark,
  plane: "sagittal" | "axial",
  author: string,
): Annotation {
  return {
    id: landmark.id,
    scope: "slice",
    kind: "marker",
    plane,
    seriesId: landmark.seriesId,
    sliceIndex: landmark.sliceIndex,
    points: [{ x: landmark.x, y: landmark.y }],
    text: landmark.label,
    author,
    createdAt: new Date().toISOString(),
  };
}

/** Null cuando la anotación no es un landmark utilizable, en vez de un punto en (0,0). */
export function annotationToLandmark(annotation: Annotation): MarkerLandmark | null {
  if (annotation.kind !== "marker") return null;
  const point = annotation.points?.[0];
  if (!point || typeof point.x !== "number" || typeof point.y !== "number") return null;
  if (typeof annotation.sliceIndex !== "number" || !annotation.seriesId) return null;
  return {
    id: annotation.id,
    label: annotation.text || "Marca del revisor",
    seriesId: annotation.seriesId,
    sliceIndex: annotation.sliceIndex,
    x: point.x,
    y: point.y,
  };
}

/**
 * Une los borradores de landmark a la lista que se va a persistir.
 *
 * Reemplaza por identificador en vez de agregar: mover un landmark tres veces antes de
 * guardar tiene que dejar una marca en la última posición, no tres marcas.
 */
export function withLandmarkAnnotations(
  annotations: Annotation[],
  markers: Annotation[],
): Annotation[] {
  const byId = new Map(annotations.map((item) => [item.id, item]));
  markers.forEach((marker) => byId.set(marker.id, marker));
  return Array.from(byId.values());
}
