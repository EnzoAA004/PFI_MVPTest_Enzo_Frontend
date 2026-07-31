import type { LumbarLevel } from "../../clinicalDisplay";

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

export type AnnotationPoint = { x: number; y: number };

export type Annotation = {
  id: string;
  scope: AnnotationScope;
  kind: AnnotationKind;
  /** Requerido si scope = "slice": identifica la serie y el corte exactos. */
  plane?: "sagittal" | "axial";
  seriesId?: string;
  sliceIndex?: number;
  /** Requerido si scope = "level". */
  level?: LumbarLevel;
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
  level?: LumbarLevel | null;
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
