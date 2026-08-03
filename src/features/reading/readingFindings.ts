import { ALWAYS_SHOWN_LEVELS, SPINE_LEVELS, normalizeLevel, type SpineLevel } from "../../clinicalDisplay";

/**
 * Groups findings by vertebral level — the axis a radiologist actually reads and
 * reports a lumbar MRI on, craniocaudal and alternating body with disc space.
 *
 * The ten lumbar levels are always rendered, with or without a finding: "nothing at
 * L3-L4" is a clinical statement, and a level silently missing from the panel is
 * indistinguishable from a level that was never looked at. Levels outside that range
 * appear only when the study reaches them, which is the same rule read the other
 * way: an always-present empty T9-T10 row would claim a level was examined that was
 * never in the field of view.
 *
 * Measurements whose level the AI did not report land in an explicit unassigned
 * bucket instead of being spread across levels by guesswork.
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
  for (const level of SPINE_LEVELS) byLevel.set(level, []);
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

  const groups: LevelGroup[] = SPINE_LEVELS.filter(
    (level) => ALWAYS_SHOWN_LEVELS.includes(level) || (byLevel.get(level) ?? []).length,
  ).map((level) => ({
    level,
    label: level,
    findings: byLevel.get(level) ?? [],
  }));

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
