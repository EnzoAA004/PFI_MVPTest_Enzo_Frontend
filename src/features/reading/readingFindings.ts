import { LUMBAR_LEVELS, THORACIC_LEVELS, normalizeLevel, type SpineLevel } from "../../clinicalDisplay";

/**
 * Groups findings by lumbar level — the axis a radiologist actually reads and
 * reports a lumbar MRI on (L1-L2 through L5-S1).
 *
 * The level list is always rendered complete, including levels with no finding:
 * "nothing at L3-L4" is a clinical statement, and a level silently missing from
 * the panel is indistinguishable from a level that was never looked at.
 *
 * Measurements whose level the AI did not report land in an explicit unassigned
 * bucket instead of being spread across levels by guesswork.
 *
 * Thoracic levels are the exception to the complete list: they are appended above
 * L1-L2 only when the study reaches them. A lumbar protocol is not read T9-T10, so
 * an always-present empty row there would claim a level was examined and found
 * clean when it was never in the field of view.
 */

export type LevelFinding = {
  id: string;
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  confidence?: number;
  outlier?: boolean;
};

export type LevelGroup = {
  /** Canonical level, or null for the unassigned bucket. */
  level: SpineLevel | null;
  label: string;
  findings: LevelFinding[];
};

export type LevelledInput = {
  id: string;
  label: string;
  level?: string | null;
  value?: number | string | null;
  unit?: string;
  confidence?: number;
  outlier?: boolean;
};

export function groupFindingsByLevel(items: LevelledInput[]): LevelGroup[] {
  const byLevel = new Map<SpineLevel | null, LevelFinding[]>();
  for (const level of THORACIC_LEVELS) byLevel.set(level, []);
  for (const level of LUMBAR_LEVELS) byLevel.set(level, []);
  byLevel.set(null, []);

  for (const item of items) {
    const level = normalizeLevel(item.level);
    const bucket = byLevel.get(level) ?? byLevel.get(null)!;
    bucket.push({
      id: item.id,
      label: item.label,
      value: item.value,
      unit: item.unit,
      confidence: item.confidence,
      outlier: item.outlier,
    });
  }

  const thoracic: LevelGroup[] = THORACIC_LEVELS.filter((level) => (byLevel.get(level) ?? []).length).map((level) => ({
    level,
    label: level,
    findings: byLevel.get(level) ?? [],
  }));
  const groups: LevelGroup[] = [
    ...thoracic,
    ...LUMBAR_LEVELS.map((level) => ({
      level,
      label: level,
      findings: byLevel.get(level) ?? [],
    })),
  ];

  const unassigned = byLevel.get(null) ?? [];
  if (unassigned.length) {
    groups.push({ level: null, label: "Sin nivel asignado", findings: unassigned });
  }
  return groups;
}

/** True when the AI reported no level for any finding — drives the panel's notice. */
export function allFindingsUnassigned(groups: LevelGroup[]) {
  const assigned = groups.filter((g) => g.level !== null).reduce((total, g) => total + g.findings.length, 0);
  const unassigned = groups.find((g) => g.level === null)?.findings.length ?? 0;
  return assigned === 0 && unassigned > 0;
}
