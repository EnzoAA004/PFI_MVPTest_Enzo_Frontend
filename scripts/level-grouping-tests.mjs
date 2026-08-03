import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * Agrupación de hallazgos por nivel vertebral.
 *
 * Dos reglas opuestas conviven acá, y son las dos que se protegen.
 *
 * Los diez niveles lumbares -cuerpo y espacio discal, alternados- se muestran
 * siempre completos, tengan o no hallazgo: "nada en L3-L4" es una afirmación
 * clínica, y un nivel que desaparece de la lista no se distingue de un nivel que
 * nadie miró.
 *
 * Lo de afuera de ese rango aparece solo cuando el estudio lo alcanza, que es la
 * misma regla al revés: una fila T9-T10 vacía en todos los estudios afirmaría que se
 * miró un nivel que ni siquiera entraba en el encuadre.
 */
function load(path) {
  return fs.readFileSync(path, "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
}

const js = ts.transpileModule(`${load("src/clinicalDisplay.ts")}\n${load("src/features/reading/readingFindings.ts")}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const sandbox = { exports: {}, console };
vm.runInNewContext(
  `${js}\nexports.groupFindingsByLevel = groupFindingsByLevel;\nexports.normalizeLevel = normalizeLevel;\nexports.allFindingsUnassigned = allFindingsUnassigned;\nexports.levelFromMeasurementId = levelFromMeasurementId;`,
  sandbox,
);
const { groupFindingsByLevel, normalizeLevel, allFindingsUnassigned, levelFromMeasurementId } = sandbox.exports;

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
};

const finding = (level) => ({ id: `m-${level}`, label: "disc height", level, value: 9, unit: "mm" });

const LUMBAR = ["L1", "L1-L2", "L2", "L2-L3", "L3", "L3-L4", "L4", "L4-L5", "L5", "L5-S1"];

check("los diez niveles lumbares se muestran aunque el estudio no traiga nada", () => {
  const groups = groupFindingsByLevel([]);
  assert.equal(groups.map((group) => group.label).join(" "), LUMBAR.join(" "));
});

check("un cuerpo vertebral es un nivel y tiene su propia fila", () => {
  const groups = groupFindingsByLevel([{ id: "m-l4", label: "vertebra height", level: "L4", value: 27.6, unit: "mm" }]);
  const body = groups.find((group) => group.label === "L4");
  assert.equal(body.findings.length, 1);
  assert.equal(groups.find((group) => group.level === null), undefined);
});

check("un nivel torácico identificado por la IA deja de caer en 'sin nivel'", () => {
  const groups = groupFindingsByLevel([finding("T12-L1")]);
  const thoracic = groups.find((group) => group.label === "T12-L1");
  assert.ok(thoracic, "el nivel torácico tiene que tener su propia fila");
  assert.equal(thoracic.findings.length, 1);
  assert.equal(groups.find((group) => group.level === null), undefined);
});

check("todo se ordena craneocaudal, como se recorre la columna", () => {
  const groups = groupFindingsByLevel([finding("L4-L5"), finding("T12-L1"), finding("S1"), finding("T11-T12")]);
  assert.equal(groups.map((group) => group.label).join(" "), ["T11-T12", "T12-L1", ...LUMBAR, "S1"].join(" "));
});

check("un nivel que el estudio no alcanza no ocupa una fila vacía", () => {
  const groups = groupFindingsByLevel([finding("T12-L1")]);
  assert.equal(groups.some((group) => group.label === "T9-T10"), false);
  assert.equal(groups.some((group) => group.label === "S1"), false);
});

check("una medición sin nivel va al cajón aparte y no se reparte por adivinanza", () => {
  const groups = groupFindingsByLevel([{ id: "m-1", label: "disc height", level: null, value: 9, unit: "mm" }]);
  const unassigned = groups.find((group) => group.kind === "unassigned");
  assert.equal(unassigned.findings.length, 1);
  assert.equal(allFindingsUnassigned(groups), true);
});

check("lo que no corresponde a un nivel no se acusa de no tenerlo", () => {
  const groups = groupFindingsByLevel([
    { id: "sagittal-canal-area", label: "canal area", level: null, levelScope: "study", value: 2945, unit: "mm2" },
  ]);
  assert.equal(groups.find((group) => group.kind === "unassigned"), undefined);
  const general = groups.find((group) => group.kind === "study");
  assert.equal(general.label, "Medición general");
  assert.equal(general.findings.length, 1);
  // No hay medición por nivel, pero tampoco hay ninguna que haya fallado en tenerlo.
  assert.equal(allFindingsUnassigned(groups), false);
});

check("los dos casos sin nivel no se mezclan en el mismo cajón", () => {
  const groups = groupFindingsByLevel([
    { id: "sagittal-canal-area", label: "canal area", level: null, levelScope: "study", value: 2945, unit: "mm2" },
    { id: "sagittal-disc-d1-height", label: "disc height", level: null, value: 9, unit: "mm" },
  ]);
  assert.equal(groups.find((group) => group.kind === "study").findings.length, 1);
  assert.equal(groups.find((group) => group.kind === "unassigned").findings.length, 1);
  // Dos grupos sin nivel conviven, asi que la identidad no puede salir del nivel.
  const keys = groups.map((group) => group.key);
  assert.equal(new Set(keys).size, keys.length);
});

check("el nivel se recupera del id en corridas guardadas antes del arreglo", () => {
  assert.equal(levelFromMeasurementId("sagittal-disc-t11-t12-width"), "T11-T12");
  assert.equal(levelFromMeasurementId("sagittal-disc-l4-l5-area"), "L4-L5");
  assert.equal(levelFromMeasurementId("sagittal-vertebra-l4-height"), "L4");
  const groups = groupFindingsByLevel([
    { id: "sagittal-disc-t11-t12-height", label: "disc height", level: null, value: 9.84, unit: "mm" },
  ]);
  assert.equal(groups.find((group) => group.label === "T11-T12").findings.length, 1);
  assert.equal(groups.find((group) => group.kind === "unassigned"), undefined);
});

check("un disco que la IA no supo nombrar no recibe nivel desde el id", () => {
  // El slug posicional es lo que el modulo escribe cuando no pudo asignar nivel:
  // recuperarlo tiene que fallar, o se estaria inventando el nivel en vez de leerlo.
  assert.equal(levelFromMeasurementId("sagittal-disc-d1-width"), null);
  assert.equal(levelFromMeasurementId("sagittal-canal-area"), null);
  assert.equal(levelFromMeasurementId("sagittal-vertebra_group-area"), null);
});

check("un nivel desconocido no se fuerza a uno conocido", () => {
  assert.equal(normalizeLevel("C5-C6"), null);
  assert.equal(normalizeLevel("banana"), null);
  assert.equal(normalizeLevel(null), null);
});

check("las variantes de escritura del mismo nivel llegan al mismo grupo", () => {
  for (const written of ["l4-l5", "L4_L5", "L4L5", " l4 l5 "]) {
    assert.equal(normalizeLevel(written), "L4-L5", written);
  }
  assert.equal(normalizeLevel("t11_t12"), "T11-T12");
  assert.equal(normalizeLevel("l4"), "L4");
});

check("con todos los niveles asignados el aviso de 'sin nivel' no se muestra", () => {
  assert.equal(allFindingsUnassigned(groupFindingsByLevel([finding("L4-L5")])), false);
});

console.log(`level-grouping: ${passed} passed`);
