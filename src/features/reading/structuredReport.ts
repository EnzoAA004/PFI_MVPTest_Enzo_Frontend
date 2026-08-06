import { checkRange, type RangeVerdict } from "./referenceRanges";

/**
 * Informe estructurado por nivel.
 *
 * Un informe de columna no se lee como una tabla de mediciones ordenada por magnitud:
 * se lee nivel por nivel, de L1-L2 hacia abajo, porque así es como se decide dónde
 * mirar y qué operar. La exportación plana que había antes tenía los mismos números
 * pero obligaba a reconstruir esa estructura a mano.
 *
 * Dos reglas que el armado respeta:
 *
 * 1. **Un nivel sin medir y un nivel normal no son lo mismo.** El nivel que la corrida
 *    no cubrió aparece igual, declarado como no evaluado. Omitirlo lo dejaría leer
 *    como si no hubiera nada que informar ahí.
 * 2. **Se reportan magnitudes, no diagnósticos.** El texto describe la comparación
 *    contra el rango citado; nunca nombra una patología.
 */

export type ReportMeasurement = {
  id: string;
  label: string;
  labelKey: string;
  level?: string | null;
  levelScope?: string | null;
  unit: string;
  aiValue: number | string | null | undefined;
  reviewerValue?: number | string | null;
  source?: "ai" | "reviewer";
};

export type ReportEntry = {
  id: string;
  label: string;
  /** El valor que se informa: el del revisor si corrigió, si no el de la IA. */
  value: number | null;
  unit: string;
  /** De quién es el valor informado. */
  attribution: "ia" | "revisor";
  /** Valor original de la IA cuando el revisor lo corrigió. */
  aiValue: number | null;
  verdict: RangeVerdict | null;
};

export type ReportLevel = {
  level: string;
  evaluated: boolean;
  entries: ReportEntry[];
  /** Cuántas mediciones de este nivel quedaron fuera de rango. */
  flagged: number;
};

export type StructuredReport = {
  levels: ReportLevel[];
  /** Mediciones que aplican al estudio entero, no a un nivel. */
  studyWide: ReportEntry[];
  /** Mediciones que no se pudieron asignar a un nivel; no es lo mismo que las de arriba. */
  unassigned: ReportEntry[];
  flaggedTotal: number;
};

/**
 * Los niveles que un informe lumbar recorre siempre, en orden anatómico.
 *
 * Se fija acá y no se deriva de lo medido para que un nivel ausente se note. Si la
 * corrida informa además un nivel de fuera de esta lista —un T11-T12 en un estudio que
 * subió más de lo habitual— se agrega al final en vez de descartarse.
 */
export const LUMBAR_LEVELS = ["L1-L2", "L2-L3", "L3-L4", "L4-L5", "L5-S1"];

function asNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function toEntry(item: ReportMeasurement): ReportEntry {
  const ai = asNumber(item.aiValue);
  const reviewer = asNumber(item.reviewerValue);
  const value = reviewer ?? ai;
  return {
    id: item.id,
    label: item.label,
    value,
    unit: item.unit,
    attribution: reviewer !== null ? "revisor" : "ia",
    aiValue: reviewer !== null ? ai : null,
    verdict: value === null ? null : checkRange(item.labelKey, value, item.unit),
  };
}

/** Ordena por nivel anatómico; lo que no está en la lista va después, alfabético. */
function levelOrder(a: string, b: string) {
  const indexA = LUMBAR_LEVELS.indexOf(a);
  const indexB = LUMBAR_LEVELS.indexOf(b);
  if (indexA >= 0 && indexB >= 0) return indexA - indexB;
  if (indexA >= 0) return -1;
  if (indexB >= 0) return 1;
  return a.localeCompare(b);
}

export function buildStructuredReport(measurements: ReportMeasurement[]): StructuredReport {
  const byLevel = new Map<string, ReportEntry[]>();
  const studyWide: ReportEntry[] = [];
  const unassigned: ReportEntry[] = [];

  for (const item of measurements) {
    const entry = toEntry(item);
    const level = typeof item.level === "string" ? item.level.trim() : "";
    if (level) {
      const bucket = byLevel.get(level) ?? [];
      bucket.push(entry);
      byLevel.set(level, bucket);
      continue;
    }
    // "No aplica a un nivel" y "no se pudo asignar" se informan por separado: la
    // primera es una propiedad de la medición, la segunda es una limitación nuestra.
    if (item.levelScope === "study") studyWide.push(entry);
    else unassigned.push(entry);
  }

  const names = Array.from(new Set([...LUMBAR_LEVELS, ...byLevel.keys()])).sort(levelOrder);
  const levels: ReportLevel[] = names.map((level) => {
    const entries = (byLevel.get(level) ?? []).slice().sort((a, b) => a.label.localeCompare(b.label));
    return {
      level,
      evaluated: entries.length > 0,
      entries,
      flagged: entries.filter((entry) => entry.verdict && entry.verdict.status !== "within").length,
    };
  });

  const flaggedTotal = levels.reduce((total, level) => total + level.flagged, 0)
    + [...studyWide, ...unassigned].filter((entry) => entry.verdict && entry.verdict.status !== "within").length;

  return { levels, studyWide, unassigned, flaggedTotal };
}

/** Cómo se lee una entrada en el informe. Descriptivo, sin nombre de patología. */
export function entryText(entry: ReportEntry): string {
  if (entry.value === null) return `${entry.label}: sin valor.`;
  const value = `${entry.value.toFixed(1)} ${entry.unit}`;
  const attribution = entry.attribution === "revisor"
    ? entry.aiValue !== null ? ` (corregido por el revisor; IA ${entry.aiValue.toFixed(1)})` : " (revisor)"
    : "";
  const range = entry.verdict ? `, ${entry.verdict.text}` : "";
  return `${entry.label}: ${value}${attribution}${range}.`;
}
