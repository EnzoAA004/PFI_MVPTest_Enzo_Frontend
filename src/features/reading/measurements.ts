import type { Plane } from "../../appTypes";
import type { SpineLevel } from "../../clinicalDisplay";
import type { AnnotationPoint } from "./annotations";

/**
 * Mediciones sobre un corte: las que propuso la IA y las que tomó el revisor.
 *
 * Son la misma cosa y se modelan igual. Se diferencian en el origen —y en que la
 * geometría de la IA se corrige mientras que la del revisor es suya desde el
 * principio— pero no en su naturaleza: las dos son una figura sobre la imagen de la
 * que sale un número. Tenerlas separadas obligaba a duplicar el dibujo, la edición y
 * el listado, y a que el médico midiera en una pantalla y corrigiera en otra.
 *
 * La regla que sostiene todo el módulo: **el valor se deriva siempre de la
 * geometría**. Nunca se guarda un número que la figura dibujada no reproduzca, para
 * que el médico no pueda ver una cota que diga algo distinto de lo que mide.
 */

export type MeasurementKind = "distance" | "angle" | "listhesis" | "roi" | "probe";

/** Milímetros, grados, milímetros cuadrados, o unidades arbitrarias de intensidad. */
export type MeasurementUnit = "mm" | "px" | "deg" | "mm2" | "px2" | "ua";

export type ReadingMeasurement = {
  id: string;
  kind: MeasurementKind;
  source: "ai" | "reviewer";
  /** 2 distancia · 4 ángulo · 3 listesis · n ROI · 1 sonda, en la base 0..256. */
  points: AnnotationPoint[];
  value: number;
  unit: MeasurementUnit;
  /** Segunda magnitud cuando la medición la tiene: grado de Meyerding, desvío del ROI. */
  detail?: string;
  level?: SpineLevel | null;
  sliceIndex: number;
  plane: Plane;
  label: string;
  aiValue?: number;
  reviewerValue?: number | null;
};

/** Cuántos clics necesita cada herramienta antes de cerrar la medición. */
export const POINTS_REQUIRED: Record<MeasurementKind, number> = {
  distance: 2,
  angle: 4,
  listhesis: 3,
  roi: 0, // trazo libre: se cierra al soltar, no por cantidad de clics
  probe: 1,
};

export type Frame = { width: number; height: number };

/**
 * Lleva un punto de la base 0..256 a milímetros.
 *
 * La base normalizada no es cuadrada salvo que la imagen lo sea, así que primero se
 * vuelve al marco real y recién ahí se aplica el spacing. Hacerlo al revés deforma
 * cualquier medida que no sea horizontal o vertical.
 */
function toMillimetres(point: AnnotationPoint, frame: Frame, spacingMm?: number[] | null) {
  const x = point.x / 256 * frame.width;
  const y = point.y / 256 * frame.height;
  const [rowSpacing, colSpacing] = physicalSpacing(spacingMm) ?? [1, 1];
  return { x: x * colSpacing, y: y * rowSpacing };
}

/** El spacing solo vale si informa las dos direcciones con números positivos. */
export function physicalSpacing(spacingMm?: number[] | null): [number, number] | null {
  const row = spacingMm?.[0];
  const col = spacingMm?.[1];
  if (typeof row !== "number" || typeof col !== "number" || row <= 0 || col <= 0) return null;
  return [row, col];
}

/** Distancia entre dos puntos. mm si la corrida informó escala física, píxeles si no. */
export function distanceBetween(
  from: AnnotationPoint,
  to: AnnotationPoint,
  frame: Frame,
  spacingMm?: number[] | null,
): { value: number; unit: "mm" | "px" } {
  const a = toMillimetres(from, frame, spacingMm);
  const b = toMillimetres(to, frame, spacingMm);
  return { value: Math.hypot(b.x - a.x, b.y - a.y), unit: physicalSpacing(spacingMm) ? "mm" : "px" };
}

/**
 * Ángulo entre las dos rectas que definen cuatro puntos (Cobb).
 *
 * Se calcula en milímetros y no en la grilla de píxeles: con píxeles no cuadrados,
 * la grilla está estirada en un eje y cualquier ángulo que no sea recto sale
 * deformado. Es el mismo motivo por el que los ejes de una estructura se buscan en
 * milímetros en el AI Module.
 *
 * Se informa el ángulo agudo, porque una recta no tiene sentido: si dependiera de
 * hacia dónde arrastró el médico, la misma lordosis daría 50 o 130 según el orden de
 * los clics. Queda como límite conocido que una angulación mayor a 90 grados —que en
 * una lumbar no se da— se informaría como su suplementario.
 */
export function angleBetween(
  points: AnnotationPoint[],
  frame: Frame,
  spacingMm?: number[] | null,
): { value: number; unit: "deg" } | null {
  if (points.length < 4) return null;
  const [a, b, c, d] = points.map((point) => toMillimetres(point, frame, spacingMm));
  const first = Math.atan2(b.y - a.y, b.x - a.x);
  const second = Math.atan2(d.y - c.y, d.x - c.x);
  let degrees = Math.abs((first - second) * 180 / Math.PI) % 180;
  if (degrees > 90) degrees = 180 - degrees;
  return { value: degrees, unit: "deg" };
}

/** Grado de Meyerding: cuánto se desplazó, en cuartos del ancho de la vértebra. */
export function meyerdingGrade(ratio: number) {
  if (ratio <= 0.25) return "I";
  if (ratio <= 0.5) return "II";
  if (ratio <= 0.75) return "III";
  if (ratio <= 1) return "IV";
  return "V";
}

/**
 * Listesis: cuánto se corrió una vértebra sobre la de abajo.
 *
 * Tres puntos, en este orden: la esquina **anterior** del platillo superior de la
 * vértebra inferior, su esquina **posterior**, y la esquina **posterior** de la
 * vértebra que se deslizó. Los dos primeros dan a la vez la dirección del platillo y
 * su longitud anteroposterior, que es contra lo que Meyerding mide el porcentaje;
 * pedir un cuarto punto para lo mismo sería pedirle al médico un clic que el sistema
 * ya tiene.
 *
 * El deslizamiento es la proyección sobre el platillo y no la distancia directa: lo
 * que se informa es cuánto se corrió hacia adelante o atrás, no cuánto se separó.
 */
export function listhesisFrom(
  points: AnnotationPoint[],
  frame: Frame,
  spacingMm?: number[] | null,
): { value: number; unit: "mm" | "px"; detail: string } | null {
  if (points.length < 3) return null;
  const [anterior, posterior, slipped] = points.map((point) => toMillimetres(point, frame, spacingMm));
  const axisX = posterior.x - anterior.x;
  const axisY = posterior.y - anterior.y;
  const endplate = Math.hypot(axisX, axisY);
  if (endplate === 0) return null;
  const slip = Math.abs(((slipped.x - posterior.x) * axisX + (slipped.y - posterior.y) * axisY) / endplate);
  return {
    value: slip,
    unit: physicalSpacing(spacingMm) ? "mm" : "px",
    detail: `grado ${meyerdingGrade(slip / endplate)}`,
  };
}

/**
 * Área de un polígono cerrado, por la fórmula del agrimensor.
 *
 * El valor absoluto hace que no importe si el médico trazó en sentido horario o
 * antihorario: un área negativa solo significa que dio la vuelta al revés.
 */
export function polygonArea(
  points: AnnotationPoint[],
  frame: Frame,
  spacingMm?: number[] | null,
): { value: number; unit: "mm2" | "px2" } | null {
  if (points.length < 3) return null;
  const millimetres = points.map((point) => toMillimetres(point, frame, spacingMm));
  let total = 0;
  for (let index = 0; index < millimetres.length; index += 1) {
    const current = millimetres[index];
    const next = millimetres[(index + 1) % millimetres.length];
    total += current.x * next.y - next.x * current.y;
  }
  return { value: Math.abs(total) / 2, unit: physicalSpacing(spacingMm) ? "mm2" : "px2" };
}

/** Si un punto cae dentro del polígono, por el conteo de cruces de una semirrecta. */
export function pointInPolygon(point: AnnotationPoint, polygon: AnnotationPoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = a.y > point.y !== b.y > point.y
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export type IntensityStats = { mean: number; deviation: number; count: number };

/**
 * Media y desvío de la intensidad dentro de un polígono.
 *
 * Las intensidades son las originales del corte, no las del PNG ventaneado: sobre
 * ocho bits ya aplastados la media describiría cómo se ve la imagen, no lo que el
 * equipo midió.
 *
 * El número es en unidades arbitrarias y **no se compara entre estudios**: una
 * resonancia sin calibrar no produce intensidades absolutas, así que el mismo tejido
 * da valores distintos en dos equipos, o en el mismo equipo otro día.
 */
export function intensityStats(
  polygon: AnnotationPoint[],
  pixels: Int16Array,
  meta: { width: number; height: number },
): IntensityStats | null {
  if (polygon.length < 3) return null;
  const xs = polygon.map((point) => point.x / 256 * meta.width);
  const ys = polygon.map((point) => point.y / 256 * meta.height);
  const inPixels = polygon.map((point, index) => ({ x: xs[index], y: ys[index] }));
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const right = Math.min(meta.width - 1, Math.ceil(Math.max(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const bottom = Math.min(meta.height - 1, Math.ceil(Math.max(...ys)));

  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (!pointInPolygon({ x, y }, inPixels)) continue;
      const value = pixels[y * meta.width + x];
      count += 1;
      sum += value;
      sumSquares += value * value;
    }
  }
  if (!count) return null;
  const mean = sum / count;
  return { mean, deviation: Math.sqrt(Math.max(0, sumSquares / count - mean * mean)), count };
}

/** Intensidad original en un punto. Devuelve null si el corte crudo no está. */
export function probeIntensity(
  point: AnnotationPoint,
  pixels: Int16Array,
  meta: { width: number; height: number },
): number | null {
  const x = Math.round(point.x / 256 * meta.width);
  const y = Math.round(point.y / 256 * meta.height);
  if (x < 0 || y < 0 || x >= meta.width || y >= meta.height) return null;
  const value = pixels[y * meta.width + x];
  return typeof value === "number" ? value : null;
}

export type Recomputed = { value: number; unit: MeasurementUnit; detail?: string };

/**
 * Recalcula el valor de una medición desde su figura.
 *
 * Es el único camino por el que un valor entra al sistema, de modo que arrastrar un
 * extremo y dibujar una figura nueva produzcan el número por la misma vía. Mientras
 * hubo dos caminos, la cota y la tabla podían discrepar sin que nada lo detectara.
 */
export function recomputeValue(
  kind: MeasurementKind,
  points: AnnotationPoint[],
  frame: Frame,
  spacingMm?: number[] | null,
): Recomputed | null {
  if (kind === "distance") {
    if (points.length < 2) return null;
    return distanceBetween(points[0], points[1], frame, spacingMm);
  }
  if (kind === "angle") return angleBetween(points, frame, spacingMm);
  if (kind === "listhesis") return listhesisFrom(points, frame, spacingMm);
  if (kind === "roi") return polygonArea(points, frame, spacingMm);
  return null;
}

export function formatMeasurementValue(value: number, unit: MeasurementUnit) {
  const decimals = unit === "ua" ? 0 : unit === "deg" ? 1 : unit === "mm2" || unit === "px2" ? 1 : unit === "px" ? 0 : 2;
  const symbol = unit === "deg" ? "°" : unit === "mm2" ? "mm²" : unit === "px2" ? "px²" : unit === "ua" ? "" : unit;
  return `${value.toFixed(decimals)}${symbol === "°" ? "" : " "}${symbol}`.trim();
}
