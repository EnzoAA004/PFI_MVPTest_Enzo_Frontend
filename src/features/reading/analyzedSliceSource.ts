export type AnalyzedSliceSourceParams = {
  apiBaseUrl: string;
  sourceInputId?: string;
  index: number;
  aiIndex: number;
  legacyInputUrl?: string | null;
  legacyPreviewCount?: number;
};

function legacySlicePreviewUrl(inputUrl: string | null | undefined, index: number) {
  if (!inputUrl) return undefined;
  const name = `slice-${String(index).padStart(3, "0")}.png`;
  const separator = inputUrl.lastIndexOf("/");
  return separator < 0 ? undefined : `${inputUrl.slice(0, separator + 1)}${name}`;
}

/**
 * Resuelve la imagen de un corte de la misma serie que alimentó la corrida.
 *
 * El corte inferido conserva `input.png`: es el recurso canónico al que están
 * alineados overlay y mediciones. Los demás cortes se piden por el `inputId`
 * persistido de esa misma serie. Las corridas antiguas que no publicaban ese
 * identificador conservan la ruta histórica de previews, si declararon tenerlas.
 */
export function resolveAnalyzedSliceSource({
  apiBaseUrl,
  sourceInputId,
  index,
  aiIndex,
  legacyInputUrl,
  legacyPreviewCount = 0,
}: AnalyzedSliceSourceParams) {
  if (index === aiIndex) return undefined;
  if (sourceInputId) {
    return `${apiBaseUrl}/api/ai/series/${encodeURIComponent(sourceInputId)}/slices/${index}`;
  }
  return index < legacyPreviewCount ? legacySlicePreviewUrl(legacyInputUrl, index) : undefined;
}
