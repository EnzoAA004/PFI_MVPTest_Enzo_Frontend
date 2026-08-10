import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadPureSource(source, exportNames) {
  const stripped = source
    .replace(/import\s+(?:type\s+)?[\s\S]*?\s+from\s+"[^"]+";\s*/g, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(stripped, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}\n${exportNames.map((name) => `exports.${name} = ${name};`).join("\n")}`, sandbox);
  return sandbox.exports;
}

const groupingSource = readFileSync("src/features/reading/measurementGrouping.ts", "utf8");
const grouping = loadPureSource(groupingSource, ["classifyMeasurement", "groupMeasurements"]);

const levelSource = readFileSync("src/features/reading/LevelNavigator.tsx", "utf8");
const levelPureSource = levelSource.slice(0, levelSource.indexOf("type Props ="));
const levels = loadPureSource(levelPureSource, ["levelNavigatorSection", "partitionLevelGroups", "nextLevelSelection"]);

const inspectorSource = readFileSync("src/features/reading/ReviewInspector.tsx", "utf8");
const reviewSource = readFileSync("src/components/StudyReviewView.tsx", "utf8");
const measurementPanelSource = readFileSync("src/features/reading/MeasurementPanel.tsx", "utf8");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const row = (overrides = {}) => ({ id: "m-1", labelKey: "unknown_metric", level: "L4-L5", ...overrides });

check("labelKey disc se agrupa como Disco", () => {
  assert.equal(grouping.classifyMeasurement(row({ labelKey: "disc_group height" })), "disc");
});

check("labelKey canal se agrupa como Canal", () => {
  assert.equal(grouping.classifyMeasurement(row({ labelKey: "canal area" })), "canal");
});

check("labelKey vertebra se agrupa como Vértebra", () => {
  assert.equal(grouping.classifyMeasurement(row({ labelKey: "vertebra_group width", level: "L4" })), "vertebra");
});

check("clases axiales persistidas conservan su estructura", () => {
  assert.equal(grouping.classifyMeasurement(row({ labelKey: "raw_50 area" })), "disc");
  assert.equal(grouping.classifyMeasurement(row({ labelKey: "raw_150 height" })), "canal");
});

check("desconocido cae en Otras", () => {
  assert.equal(grouping.classifyMeasurement(row()), "other");
});

check("corridas antiguas usan fallback por id", () => {
  assert.equal(grouping.classifyMeasurement(row({ labelKey: undefined, label: undefined, id: "sagittal-disc-l4-l5-height" })), "disc");
});

check("generales y sin nivel permanecen separados", () => {
  assert.equal(grouping.classifyMeasurement(row({ level: undefined, levelScope: "study" })), "general");
  assert.equal(grouping.classifyMeasurement(row({ level: undefined })), "unassigned");
});

check("agrupar no muta input ni reemplaza identidades", () => {
  const rows = Object.freeze([
    Object.freeze(row({ id: "disc-1", labelKey: "disc width" })),
    Object.freeze(row({ id: "canal-1", labelKey: "canal width" })),
  ]);
  const before = JSON.stringify(rows);
  const grouped = grouping.groupMeasurements(rows);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(grouped[0].rows[0], rows[0]);
  assert.equal(grouped[1].rows[0], rows[1]);
});

const group = (key, kind = "level") => ({ key, level: kind === "level" ? key : null, kind, label: key, findings: [] });

check("L4 y L4-L5 emiten exactamente su key", () => {
  assert.equal(levels.nextLevelSelection(null, "L4"), "L4");
  assert.equal(levels.nextLevelSelection(null, "L4-L5"), "L4-L5");
});

check("discos y vértebras se presentan por separado", () => {
  const sections = levels.partitionLevelGroups([group("L4"), group("L4-L5")]);
  assert.equal(sections.vertebra[0].key, "L4");
  assert.equal(sections.disc[0].key, "L4-L5");
});

check("niveles transicionales y grupos especiales no desaparecen", () => {
  const sections = levels.partitionLevelGroups([group("T11-T12"), group("T12-L1"), group("__general__", "study")]);
  assert.deepEqual(Array.from(sections.other, (item) => item.key), ["T11-T12", "T12-L1", "__general__"]);
});

check("selección actual se preserva y segundo click limpia", () => {
  assert.equal(levels.nextLevelSelection("L4", "L4-L5"), "L4-L5");
  assert.equal(levels.nextLevelSelection("L4-L5", "L4-L5"), null);
});

check("inspector expone exactamente cuatro tabs", () => {
  const labels = Array.from(inspectorSource.matchAll(/\{ id: "(?:measurements|ai|review|more)", label: "([^"]+)" \}/g), (match) => match[1]);
  assert.deepEqual(labels, ["Mediciones", "Hallazgos IA", "Revisión", "Más"]);
});

check("tabs y paneles tienen semántica y teclado accesibles", () => {
  for (const token of ['role="tablist"', 'role="tab"', "aria-selected", "aria-controls", 'role="tabpanel"', "ArrowRight", "ArrowLeft", "Home", "End", ":focus-visible"]) {
    const source = token === ":focus-visible" ? readFileSync("src/features/reading/reading.css", "utf8") : inspectorSource;
    assert.ok(source.includes(token), token);
  }
});

check("cambiar tab oculta sin desmontar contenido", () => {
  assert.ok(inspectorSource.includes("hidden={activeTab !== tab}"));
  assert.ok(inspectorSource.includes("{children}"));
  assert.equal(inspectorSource.includes("activeTab === tab &&"), false);
});

check("Hallazgos IA contiene hallazgos discales y subarticular", () => {
  const start = reviewSource.indexOf('tab="ai"');
  const end = reviewSource.indexOf("</ReviewInspectorPanel>", start);
  const aiPanel = reviewSource.slice(start, end);
  assert.ok(aiPanel.includes("DiscDegenerativeFindingsPanel"));
  assert.ok(aiPanel.includes("DegenerativeFindingsPanel"));
  assert.ok(aiPanel.includes("submitRoi"));
});

check("governance clínico usa disclosure y no invade el viewport", () => {
  const workspaceNotice = readFileSync("src/features/reading/WorkspaceGovernanceNotice.tsx", "utf8");
  const viewport = readFileSync("src/features/reading/PlaneViewport.tsx", "utf8");
  const discPanel = readFileSync("src/features/reading/DiscDegenerativeFindingsPanel.tsx", "utf8");
  assert.match(workspaceNotice, /IA asistida · Revisión profesional requerida/);
  assert.match(workspaceNotice, /<details/);
  assert.doesNotMatch(viewport, /No apto para diagnóstico clínico/);
  assert.doesNotMatch(discPanel, /Hallazgos discales P10\.7/);
  assert.doesNotMatch(discPanel, /\bMVP\b/);
});

check("subarticular conserva flujo y desplaza researchOnly al alcance contextual", () => {
  const panel = readFileSync("src/features/reading/DegenerativeFindingsPanel.tsx", "utf8");
  assert.match(panel, /Selección manual/);
  assert.match(panel, /ⓘ Alcance de la clasificación/);
  assert.match(panel, /finding\.researchOnly/);
  assert.doesNotMatch(panel, /Manual · Investigación/);
  for (const callback of ["roi.onToggle", "roi.onChangeSide", "roi.onChangeLevel", "roi.onSubmit", "roi.onCancel"]) {
    assert.ok(panel.includes(callback), callback);
  }
  for (const field of ["draft.x", "draft.y", "draft.side", "draft.level", "draft.instanceNumber"]) {
    assert.ok(panel.includes(field), field);
  }
});

check("selectedLevel, drafts y slice siguen poseídos por StudyReviewView", () => {
  for (const state of ["selectedLevel", "notes", "noteDraft", "annotations", "selectedMeasurementId", "sliceByPlane"]) {
    assert.match(reviewSource, new RegExp(`const \\[${state}, set`, "m"), state);
  }
  assert.ok(reviewSource.indexOf("<PlaneViewport") < reviewSource.indexOf("<ReviewInspector activeTab"));
});

check("filas agrupadas conservan id y callbacks del editor", () => {
  assert.ok(measurementPanelSource.includes("key={row.id}"));
  for (const callback of ["onSelect", "onHighlight", "onChangeValue", "onDelete"]) assert.ok(measurementPanelSource.includes(callback));
  assert.ok(reviewSource.includes("groups={activeGroup ? measurementGroups : measurementSummaryGroups}"));
});

console.log(`ux-clinical-inspector: ${passed} passed`);
