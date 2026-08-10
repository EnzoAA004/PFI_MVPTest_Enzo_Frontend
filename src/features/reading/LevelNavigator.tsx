import type { LevelGroup } from "./readingFindings";

export type LevelNavigatorSection = "disc" | "vertebra" | "other";

export const LEVEL_NAVIGATOR_LABELS: Record<LevelNavigatorSection, string> = {
  disc: "Discos",
  vertebra: "Vértebras",
  other: "Transicionales / otros",
};

const LUMBAR_DISC = new Set(["L1-L2", "L2-L3", "L3-L4", "L4-L5", "L5-S1"]);
const LUMBAR_VERTEBRA = /^L[1-5]$/;

export function levelNavigatorSection(group: LevelGroup): LevelNavigatorSection {
  if (group.kind !== "level") return "other";
  if (LUMBAR_DISC.has(group.key)) return "disc";
  if (LUMBAR_VERTEBRA.test(group.key)) return "vertebra";
  return "other";
}

export function partitionLevelGroups(groups: readonly LevelGroup[]) {
  const sections: Record<LevelNavigatorSection, LevelGroup[]> = { disc: [], vertebra: [], other: [] };
  for (const group of groups) sections[levelNavigatorSection(group)].push(group);
  return sections;
}

export function nextLevelSelection(currentKey: string | null, clickedKey: string) {
  return currentKey === clickedKey ? null : clickedKey;
}

type Props = {
  groups: LevelGroup[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
};

export function LevelNavigator({ groups, selectedKey, onSelect }: Props) {
  const sections = partitionLevelGroups(groups);

  return (
    <nav aria-label="Niveles anatómicos" className="rr-level-navigator">
      {(Object.keys(sections) as LevelNavigatorSection[]).map((section) => {
        const sectionGroups = sections[section];
        if (!sectionGroups.length) return null;
        return (
          <section className="rr-level-section" key={section}>
            <h4>{LEVEL_NAVIGATOR_LABELS[section]}</h4>
            <div className="rr-level-list">
              {sectionGroups.map((group) => {
                const active = selectedKey === group.key;
                return (
                  <button
                    aria-label={`${group.label}: ${group.findings.length} mediciones`}
                    aria-pressed={active}
                    className={`rr-level rr-level-${group.kind}${active ? " is-active" : ""}${group.findings.length ? "" : " is-empty"}`}
                    key={group.key}
                    onClick={() => onSelect(nextLevelSelection(selectedKey, group.key))}
                    type="button"
                  >
                    <span className="rr-level-name">{group.label}</span>
                    <span aria-hidden="true" className="rr-level-count">{group.findings.length || "—"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
