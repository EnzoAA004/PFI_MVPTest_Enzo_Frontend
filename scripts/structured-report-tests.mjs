import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * Informe estructurado por nivel.
 *
 * Lo que se protege es que un nivel que la corrida no cubrió siga apareciendo. Un
 * informe que lista solo lo medido se lee como si los niveles ausentes estuvieran
 * bien, y esa es una afirmación que nadie hizo.
 */
function load(path, exportNames) {
  const source = fs.readFileSync(path, "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  return { source, exportNames };
}

const ranges = load("src/features/reading/referenceRanges.ts");
const report = load("src/features/reading/structuredReport.ts");
const js = ts.transpileModule(`${ranges.source}\n${report.source}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, console };
vm.runInNewContext(`${js}
exports.buildStructuredReport = buildStructuredReport;
exports.entryText = entryText;
exports.LUMBAR_LEVELS = LUMBAR_LEVELS;`, sandbox);
const { buildStructuredReport, entryText, LUMBAR_LEVELS } = sandbox.exports;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

const medicion = (extra) => ({
  id: "m1", label: "Diámetro AP del canal", labelKey: "canal ap", unit: "mm", aiValue: 14, ...extra,
});

check("los cinco niveles lumbares aparecen aunque no se hayan medido", () => {
  const informe = buildStructuredReport([]);
  assert.deepEqual(informe.levels.map((item) => item.level), LUMBAR_LEVELS);
  assert.ok(informe.levels.every((item) => !item.evaluated), "sin mediciones ninguno está evaluado");
});

check("un nivel medido queda marcado como evaluado", () => {
  const informe = buildStructuredReport([medicion({ level: "L4-L5" })]);
  const l4 = informe.levels.find((item) => item.level === "L4-L5");
  assert.equal(l4.evaluated, true);
  assert.equal(l4.entries.length, 1);
  assert.equal(informe.levels.find((item) => item.level === "L1-L2").evaluated, false);
});

check("los niveles salen en orden anatómico, no alfabético", () => {
  const informe = buildStructuredReport([
    medicion({ id: "a", level: "L5-S1" }), medicion({ id: "b", level: "L1-L2" }),
  ]);
  // Array.from re-crea el arreglo en este realm: el del sandbox tiene otro prototipo
  // y deepStrictEqual lo rechaza aunque el contenido sea idéntico.
  const conDatos = Array.from(informe.levels.filter((item) => item.evaluated).map((item) => item.level));
  assert.deepEqual(conDatos, ["L1-L2", "L5-S1"]);
});

check("un nivel fuera de la lista lumbar se agrega, no se descarta", () => {
  // Un estudio que sube más de lo habitual trae T11-T12: perderlo sería perder datos.
  const informe = buildStructuredReport([medicion({ level: "T11-T12" })]);
  const extra = informe.levels.find((item) => item.level === "T11-T12");
  assert.ok(extra, "el nivel informado tiene que estar");
  assert.equal(extra.evaluated, true);
  assert.equal(informe.levels[informe.levels.length - 1].level, "T11-T12", "va después de los lumbares");
});

check("no aplica a un nivel y no se pudo asignar se informan aparte", () => {
  const informe = buildStructuredReport([
    medicion({ id: "a", level: null, levelScope: "study" }),
    medicion({ id: "b", level: null, levelScope: "level" }),
  ]);
  assert.equal(informe.studyWide.length, 1);
  assert.equal(informe.unassigned.length, 1);
});

check("un valor fuera de rango se cuenta en su nivel y en el total", () => {
  const informe = buildStructuredReport([medicion({ level: "L4-L5", aiValue: 9.8 })]);
  assert.equal(informe.levels.find((item) => item.level === "L4-L5").flagged, 1);
  assert.equal(informe.flaggedTotal, 1);
});

check("un valor dentro de rango no se marca", () => {
  const informe = buildStructuredReport([medicion({ level: "L4-L5", aiValue: 18 })]);
  assert.equal(informe.flaggedTotal, 0);
});

check("el informe usa el valor del revisor y deja el de la IA al lado", () => {
  const informe = buildStructuredReport([medicion({ level: "L4-L5", aiValue: 9.8, reviewerValue: "13.2" })]);
  const entrada = informe.levels.find((item) => item.level === "L4-L5").entries[0];
  assert.equal(entrada.value, 13.2);
  assert.equal(entrada.attribution, "revisor");
  assert.equal(entrada.aiValue, 9.8);
  assert.match(entryText(entrada), /corregido por el revisor; IA 9\.8/);
  assert.equal(informe.flaggedTotal, 0, "corregido a 13.2 ya no está fuera de rango");
});

check("una medición sin rango se informa sin veredicto", () => {
  // El ancho de un disco se mide y se reporta, pero no tiene corte normal/anormal.
  const informe = buildStructuredReport([
    { id: "x", label: "Ancho discal", labelKey: "disc width", unit: "mm", aiValue: 33, level: "L4-L5" },
  ]);
  const entrada = informe.levels.find((item) => item.level === "L4-L5").entries[0];
  assert.equal(entrada.verdict, null);
  assert.ok(!entryText(entrada).includes("rango de referencia"));
});

check("el texto de una entrada no nombra patologías", () => {
  const informe = buildStructuredReport([medicion({ level: "L4-L5", aiValue: 9.8 })]);
  const texto = entryText(informe.levels.find((item) => item.level === "L4-L5").entries[0]);
  for (const palabra of ["estenosis", "hernia", "protrusión", "compresión"]) {
    assert.ok(!texto.toLowerCase().includes(palabra), `el informe no puede decir "${palabra}": ${texto}`);
  }
  assert.match(texto, /por debajo del rango de referencia/);
});

check("una medición sin valor se informa como tal y no como cero", () => {
  const informe = buildStructuredReport([medicion({ level: "L4-L5", aiValue: null })]);
  const entrada = informe.levels.find((item) => item.level === "L4-L5").entries[0];
  assert.equal(entrada.value, null);
  assert.match(entryText(entrada), /sin valor/);
});

console.log(`structured-report: ${passed} passed`);
