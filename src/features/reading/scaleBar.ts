/**
 * Cuánto mide la barra de escala del visor y qué número lleva.
 *
 * Vive afuera del componente para poder probarla: la elección del escalón es la parte
 * que se equivoca en silencio, y el síntoma —dos viewports lado a lado diciendo 50 mm y
 * 20 mm con escalas casi iguales— no se ve en un test de render.
 */

export type ScaleBar = {
  /** Milímetros que representa la barra. */
  mm: number;
  /** Largo en píxeles de pantalla. */
  px: number;
};

/** Escalones "redondos", los que un ojo compara sin pensar. */
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200] as const;

/**
 * Largo legible: por debajo no se puede comparar nada contra la barra, por encima no
 * entra al costado de la imagen.
 */
const MIN_PX = 40;
const MAX_PX = 200;

export type ScaleBarInput = {
  /** Espaciado del DICOM en mm: [entre filas, entre columnas]. */
  pixelSpacingMm: [number, number] | null | undefined;
  /** Ancho natural de la imagen que se está mostrando, en píxeles. */
  imageWidth: number;
  /** Ancho de la serie de origen, si el PNG mostrado tiene otra resolución. */
  sourceWidth?: number | null;
  zoom: number;
};

/**
 * La barra para el estado actual del visor, o `null` si no se puede dibujar una honesta.
 *
 * Devuelve `null` —y no una barra aproximada— cuando falta el espaciado físico. Una regla
 * sin escala real es peor que ninguna: invita a estimar tamaños sobre un número inventado.
 */
export function scaleBarFor({ pixelSpacingMm, imageWidth, sourceWidth, zoom }: ScaleBarInput): ScaleBar | null {
  if (!pixelSpacingMm || pixelSpacingMm.length !== 2) return null;
  if (!Number.isFinite(imageWidth) || imageWidth <= 0) return null;
  if (!Number.isFinite(zoom) || zoom <= 0) return null;

  // Para una barra horizontal manda el espaciado entre columnas, que en DICOM va segundo.
  const spacing = pixelSpacingMm[1] ?? pixelSpacingMm[0];
  if (!Number.isFinite(spacing) || spacing <= 0) return null;

  const width = sourceWidth && sourceWidth > 0 ? sourceWidth : imageWidth;
  const mmPerImagePixel = spacing * (width / imageWidth);
  if (!Number.isFinite(mmPerImagePixel) || mmPerImagePixel <= 0) return null;

  const pxPerMm = zoom / mmPerImagePixel;
  if (!Number.isFinite(pxPerMm) || pxPerMm <= 0) return null;

  /*
   * El escalón más grande que entre, no el primero.
   *
   * Con "el primero que entra", dos series de 0,729 y 0,688 mm/px mostraban 50 mm y
   * 20 mm una al lado de la otra. Las dos eran correctas y aun así la pantalla se leía
   * como si estuvieran a escalas muy distintas. El mayor que entra da la barra más larga
   * —y por lo tanto la más precisa de leer— y hace que dos series parecidas coincidan.
   */
  let best: ScaleBar | null = null;
  for (const mm of STEPS) {
    const px = mm * pxPerMm;
    if (px >= MIN_PX && px <= MAX_PX) best = { mm, px };
  }
  return best;
}
