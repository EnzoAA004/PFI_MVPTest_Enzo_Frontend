import type { FindingSide } from "./degenerativeFindings";

/**
 * De un clic sobre un corte axial a los datos que el clasificador subarticular necesita:
 * el lado del paciente y el nivel discal.
 *
 * Sigue la convención de los PACS: los dos se derivan del DICOM y se le muestran al
 * lector, que puede corregirlos antes de confirmar. No se le pide que tipee lo que la
 * serie ya sabe, y no se manda nada que no haya visto.
 */

export type Vec3 = [number, number, number];

/**
 * Lateralidad del paciente, no del que mira la pantalla.
 *
 * **Este es el punto donde es fácil equivocarse y donde equivocarse importa.** El lado
 * no es el signo de x respecto del centro de la imagen. En una axial en orientación
 * neutra —la convención radiológica es mirar al paciente desde los pies— la izquierda de
 * la imagen es la *derecha* del paciente, así que deducirlo de la pantalla da el lado
 * invertido. Y hay series adquiridas con otra orientación, donde no se invierte.
 *
 * Lo que sí lo determina es `ImageOrientationPatient` (DICOM 0020|0037): el primer vector
 * dice hacia dónde apunta, en coordenadas del paciente, el eje horizontal de la imagen.
 * En LPS el eje x crece hacia la izquierda del paciente, así que el componente x de ese
 * vector es el que traduce "me moví a la derecha en la imagen" a un lado anatómico.
 *
 * Devuelve `null` cuando la serie no publica orientación para ese corte. Sin ella el lado
 * no se puede saber, y elegir uno por defecto sería marcar un receso por el otro.
 */
export function sideFromSliceOrientation(
  point: { x: number; y: number },
  imageWidth: number,
  rowDirection: Vec3 | null | undefined,
): FindingSide | null {
  if (!rowDirection || rowDirection.length !== 3) return null;
  if (!rowDirection.every((value) => Number.isFinite(value))) return null;
  if (!Number.isFinite(imageWidth) || imageWidth <= 0) return null;
  if (!Number.isFinite(point.x)) return null;

  const offsetFromCentre = point.x - imageWidth / 2;
  // Componente izquierda-derecha del desplazamiento, en coordenadas del paciente.
  const towardsPatientLeft = offsetFromCentre * rowDirection[0];

  // Sobre la línea media no hay receso que marcar, y forzar un lado sería inventarlo.
  if (Math.abs(towardsPatientLeft) < LATERALITY_EPSILON) return null;
  return towardsPatientLeft > 0 ? "left" : "right";
}

/**
 * Umbral en píxeles-por-componente por debajo del cual el punto se considera en la línea
 * media. No es una tolerancia numérica: es anatómica. Un clic a menos de un par de
 * píxeles del centro no identifica un lado.
 */
const LATERALITY_EPSILON = 1;

export type SliceLevel = { index: number; level: string };

/**
 * Niveles por corte tal como los publica la corrida axial (`quality.sliceLevels`).
 *
 * Se parsea defensivamente y se descarta lo que no tenga forma: es un campo que el módulo
 * de IA sigue enriqueciendo, y un elemento mal formado no puede tirar la pantalla.
 */
export function parseSliceLevels(raw: unknown): Map<number, string> {
  const result = new Map<number, string>();
  if (!Array.isArray(raw)) return result;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { index, level } = item as { index?: unknown; level?: unknown };
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0) continue;
    if (typeof level !== "string" || !level.trim()) continue;
    result.set(index, level.trim());
  }
  return result;
}

/**
 * Nivel del corte que se está mirando, o `null`.
 *
 * **No hereda el nivel de un corte vecino.** Una serie axial lumbar se adquiere en bloques
 * angulados, uno por disco, así que el corte de al lado puede mirar otro nivel. Y un corte
 * puede estar tomado a la altura de un cuerpo vertebral y no de un espacio discal: ahí la
 * respuesta correcta es que no hay nivel que informar, no el más cercano.
 */
export function levelForSlice(sliceLevels: Map<number, string>, index: number): string | null {
  return sliceLevels.get(index) ?? null;
}

export type SubarticularRoiDraft = {
  /** Píxeles del DICOM, ya convertidos desde la base del visor. */
  x: number;
  y: number;
  instanceNumber: number;
  /** Derivado del DICOM; `null` si la serie no lo permite deducir. */
  side: FindingSide | null;
  /** Derivado del DICOM; `null` si el corte no cae en un espacio discal. */
  level: string | null;
};

/**
 * Si al borrador le falta algo para poder pedir la clasificación, el motivo. `null` si
 * está listo.
 *
 * Se devuelve el motivo y no un booleano porque la pantalla tiene que poder decir qué
 * falta: "elegí el lado" y "este corte no cae en un disco" se resuelven distinto.
 */
export function missingFieldReason(draft: SubarticularRoiDraft): string | null {
  if (!Number.isFinite(draft.x) || !Number.isFinite(draft.y)) {
    return "No se pudo ubicar el punto en píxeles del corte.";
  }
  if (!Number.isInteger(draft.instanceNumber) || draft.instanceNumber < 0) {
    return "No se conoce el número de corte de la serie.";
  }
  if (draft.side === null) {
    return "La serie no declara su orientación, así que el lado no se puede deducir. Elegilo antes de pedir la clasificación.";
  }
  if (draft.level === null) {
    return "Este corte no cae en un espacio discal, así que no tiene nivel asignado. Elegí el nivel antes de pedir la clasificación.";
  }
  return null;
}
