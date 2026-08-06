import type { Vec3 } from "./subarticularRoi";

/**
 * Las letras de orientación que van en los bordes de la imagen: R, L, A, P, H, F.
 *
 * Es equipamiento de serie en cualquier PACS y acá no existían. Importa más de lo que
 * parece: en una axial en orientación neutra —la convención radiológica es mirar al
 * paciente desde los pies— la izquierda de la imagen es la **derecha** del paciente. Sin
 * una letra en el borde, el que lee no tiene con qué verificarlo, y el sistema además ya
 * deriva el lado por su cuenta para la clasificación subarticular.
 *
 * Todo sale de `ImageOrientationPatient` (DICOM 0020|0037), que la corrida ya publica por
 * corte: dos vectores en coordenadas del paciente, el de la fila —horizontal en la
 * imagen— y el de la columna —vertical—.
 *
 * ## El sistema de coordenadas
 *
 * DICOM usa LPS: +x hacia la izquierda del paciente, +y hacia posterior, +z hacia craneal.
 * Así que un vector dice hacia dónde crece cada eje de la imagen, y su opuesto dice de
 * dónde viene.
 */

/** Letras del extremo positivo de cada eje LPS, y de su opuesto. */
const POSITIVE: [string, string, string] = ["L", "P", "H"];
const NEGATIVE: [string, string, string] = ["R", "A", "F"];

export type OrientationLabels = {
  /** Hacia dónde queda el paciente en cada borde de la imagen. */
  left: string;
  right: string;
  top: string;
  bottom: string;
};

/**
 * La letra que corresponde a la dirección en la que apunta un vector.
 *
 * Se toma el eje dominante y se ignora el resto. Un corte oblicuo apunta un poco a cada
 * lado, y componer varias letras —"RA", "RAF"— es lo que hacen algunos visores, pero en
 * una serie lumbar las angulaciones son de pocos grados y una sola letra dice lo que hay
 * que saber sin agregar ruido.
 */
function axisLabel(vector: Vec3): string | null {
  if (!vector || vector.length !== 3) return null;
  if (!vector.every((value) => Number.isFinite(value))) return null;

  let dominant = 0;
  for (let axis = 1; axis < 3; axis += 1) {
    if (Math.abs(vector[axis]) > Math.abs(vector[dominant])) dominant = axis;
  }
  // Un vector nulo no apunta a ningún lado: no hay letra que poner.
  if (Math.abs(vector[dominant]) < 1e-6) return null;
  return vector[dominant] > 0 ? POSITIVE[dominant] : NEGATIVE[dominant];
}

/**
 * Las cuatro letras de un corte, o `null` si la serie no declara su orientación.
 *
 * **Devolver `null` es parte del contrato.** Un marcador de lateralidad inventado es peor
 * que ninguno: se lee con la misma autoridad que uno correcto y no hay forma de
 * distinguirlos. Mismo criterio que `sideFromSliceOrientation`.
 *
 * @param rowDirection primer vector de 0020|0037: hacia dónde crecen las columnas.
 * @param colDirection segundo vector: hacia dónde crecen las filas.
 */
export function orientationLabels(
  rowDirection: Vec3 | null | undefined,
  colDirection: Vec3 | null | undefined,
): OrientationLabels | null {
  if (!rowDirection || !colDirection) return null;

  const right = axisLabel(rowDirection);
  const bottom = axisLabel(colDirection);
  if (!right || !bottom) return null;

  // El borde opuesto es la dirección contraria del mismo vector.
  const left = axisLabel(rowDirection.map((value) => -value) as Vec3);
  const top = axisLabel(colDirection.map((value) => -value) as Vec3);
  if (!left || !top) return null;

  return { left, right, top, bottom };
}

/** Nombre legible de cada letra, para el lector de pantalla. */
const SPOKEN: Record<string, string> = {
  R: "derecha del paciente",
  L: "izquierda del paciente",
  A: "anterior",
  P: "posterior",
  H: "craneal",
  F: "caudal",
};

export function spokenOrientation(labels: OrientationLabels): string {
  return `Orientación: ${SPOKEN[labels.left] ?? labels.left} a la izquierda, `
    + `${SPOKEN[labels.right] ?? labels.right} a la derecha, `
    + `${SPOKEN[labels.top] ?? labels.top} arriba, `
    + `${SPOKEN[labels.bottom] ?? labels.bottom} abajo.`;
}
