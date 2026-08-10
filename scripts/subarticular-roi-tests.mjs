import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * De un clic sobre un corte axial al pedido de clasificación subarticular.
 *
 * Lo que más se protege acá es la lateralidad. El lado no es el signo de x en pantalla:
 * en una axial en orientación neutra la izquierda de la imagen es la derecha del
 * paciente. Un receso marcado por el lado equivocado devuelve una clasificación que se
 * lee igual de convincente que la correcta, sobre la anatomía que no es.
 *
 * Y que un corte no herede el nivel de otro: una serie axial lumbar son bloques
 * angulados, uno por disco.
 */
const source = fs.readFileSync("src/features/reading/subarticularRoi.ts", "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/export /g, "");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, console };
vm.runInNewContext(
  `${js}
exports.sideFromSliceOrientation = sideFromSliceOrientation;
exports.parseSliceLevels = parseSliceLevels;
exports.levelForSlice = levelForSlice;
exports.missingFieldReason = missingFieldReason;`,
  sandbox,
);
const { sideFromSliceOrientation, parseSliceLevels, levelForSlice, missingFieldReason } = sandbox.exports;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

// DICOM 0020|0037, primer vector (el que recorre las columnas, horizontal en la imagen).
// Axial neutra: apunta hacia la izquierda del paciente (+x en LPS).
const NEUTRA = [1, 0, 0];
// Serie adquirida con la fila invertida: el mismo píxel cae del otro lado del paciente.
const INVERTIDA = [-1, 0, 0];
const WIDTH = 320;

// --- lateralidad -----------------------------------------------------------------

check("un punto a la derecha de la imagen es el lado izquierdo del paciente en axial neutra", () => {
  assert.equal(sideFromSliceOrientation({ x: 240, y: 100 }, WIDTH, NEUTRA), "left");
});

check("un punto a la izquierda de la imagen es el lado derecho del paciente en axial neutra", () => {
  assert.equal(sideFromSliceOrientation({ x: 80, y: 100 }, WIDTH, NEUTRA), "right");
});

check("con la fila invertida el mismo punto da el lado opuesto", () => {
  const neutra = sideFromSliceOrientation({ x: 240, y: 100 }, WIDTH, NEUTRA);
  const invertida = sideFromSliceOrientation({ x: 240, y: 100 }, WIDTH, INVERTIDA);
  assert.equal(neutra, "left");
  assert.equal(invertida, "right");
  assert.notEqual(neutra, invertida);
});

check("un punto sobre la linea media no recibe lado", () => {
  assert.equal(sideFromSliceOrientation({ x: WIDTH / 2, y: 100 }, WIDTH, NEUTRA), null);
});

check("sin orientacion del corte no se adivina el lado", () => {
  assert.equal(sideFromSliceOrientation({ x: 240, y: 100 }, WIDTH, null), null);
  assert.equal(sideFromSliceOrientation({ x: 240, y: 100 }, WIDTH, undefined), null);
});

check("una orientacion con valores no finitos no produce lado", () => {
  assert.equal(sideFromSliceOrientation({ x: 240, y: 100 }, WIDTH, [NaN, 0, 0]), null);
  assert.equal(sideFromSliceOrientation({ x: 240, y: 100 }, WIDTH, [Infinity, 0, 0]), null);
});

check("un ancho invalido no produce lado", () => {
  assert.equal(sideFromSliceOrientation({ x: 240, y: 100 }, 0, NEUTRA), null);
  assert.equal(sideFromSliceOrientation({ x: 240, y: 100 }, -320, NEUTRA), null);
});

check("una serie oblicua toma el lado del componente izquierda-derecha, no del mayor", () => {
  // Fila casi antero-posterior pero con un componente x pequeno y negativo: el lado lo
  // decide ese componente, aunque el vector apunte mayormente a otro eje.
  assert.equal(sideFromSliceOrientation({ x: 240, y: 100 }, WIDTH, [-0.1, 0.99, 0]), "right");
});

// --- nivel por corte -------------------------------------------------------------

check("parseSliceLevels arma el mapa por indice", () => {
  const map = parseSliceLevels([{ index: 0, level: "L3-L4" }, { index: 7, level: "L4-L5" }]);
  assert.equal(map.get(0), "L3-L4");
  assert.equal(map.get(7), "L4-L5");
  assert.equal(map.size, 2);
});

check("parseSliceLevels descarta lo que no tiene forma sin romper", () => {
  const map = parseSliceLevels([
    { index: 0, level: "L3-L4" },
    { index: "1", level: "L4-L5" },
    { index: 2, level: "" },
    { index: -1, level: "L5-S1" },
    { index: 1.5, level: "L1-L2" },
    null,
    "basura",
  ]);
  assert.equal(map.size, 1);
  assert.equal(map.get(0), "L3-L4");
});

check("parseSliceLevels tolera que el campo no exista", () => {
  assert.equal(parseSliceLevels(undefined).size, 0);
  assert.equal(parseSliceLevels(null).size, 0);
  assert.equal(parseSliceLevels({}).size, 0);
});

check("un corte sin nivel no hereda el del vecino", () => {
  const map = parseSliceLevels([{ index: 0, level: "L4-L5" }, { index: 2, level: "L3-L4" }]);
  assert.equal(levelForSlice(map, 0), "L4-L5");
  assert.equal(levelForSlice(map, 1), null);
  assert.equal(levelForSlice(map, 2), "L3-L4");
});

// --- borrador del ROI ------------------------------------------------------------

const draft = (overrides = {}) => ({
  x: 240, y: 100, instanceNumber: 7, side: "left", level: "L4-L5", ...overrides,
});

check("un borrador completo no informa faltantes", () => {
  assert.equal(missingFieldReason(draft()), null);
});

check("sin lado se pide elegirlo, no se asume uno", () => {
  const reason = missingFieldReason(draft({ side: null }));
  assert.ok(reason && reason.includes("lado"));
});

check("sin nivel se pide elegirlo y se explica por que falta", () => {
  const reason = missingFieldReason(draft({ level: null }));
  assert.ok(reason && reason.includes("nivel"));
  assert.ok(reason.includes("discal"));
});

check("una coordenada no finita se informa antes que el resto", () => {
  assert.ok(missingFieldReason(draft({ x: NaN })));
  assert.ok(missingFieldReason(draft({ y: Infinity })));
});

check("un numero de corte invalido se informa", () => {
  assert.ok(missingFieldReason(draft({ instanceNumber: -1 })));
  assert.ok(missingFieldReason(draft({ instanceNumber: 1.5 })));
});

// --- invariantes del cableado ----------------------------------------------------
//
// Se verifican sobre el código y no sobre el DOM porque son propiedades de la
// arquitectura, no del render: sobreviven a cualquier cambio de layout y fallan justo
// cuando alguien las rompe. Mismo criterio que p10c1-security-tests.

const viewSource = fs.readFileSync("src/components/StudyReviewView.tsx", "utf8");
const apiSource = fs.readFileSync("src/multiplanarApi.ts", "utf8");
const panelSource = fs.readFileSync("src/features/reading/DegenerativeFindingsPanel.tsx", "utf8");

check("la clasificación se pide al Backend y nunca al módulo de IA directo", () => {
  assert.ok(apiSource.includes('"/api/ai/degenerative-findings/subarticular"'));
  // El path del módulo de IA no puede aparecer en el frontend: la arquitectura es
  // Frontend -> Backend -> AI Module.
  assert.ok(!apiSource.includes("/degenerative-findings/subarticular/predict"));
  assert.ok(!viewSource.includes("/degenerative-findings/subarticular/predict"));
});

check("la coordenada se convierte a píxeles del DICOM antes de mandarse", () => {
  // El punto que se manda tiene que salir de buildRoiDraft, y buildRoiDraft de
  // viewerPointToImagePixels. Mandarlo en la base del visor devuelve un resultado de
  // otra parte de la anatomía, con la misma pinta de ser correcto.
  const draft = viewSource.slice(viewSource.indexOf("function buildRoiDraft"));
  assert.ok(draft.slice(0, 600).includes("viewerPointToImagePixels"));
});

check("el lado se deriva de la orientación del corte, no del signo de x en pantalla", () => {
  const draft = viewSource.slice(viewSource.indexOf("function buildRoiDraft"));
  assert.ok(draft.slice(0, 900).includes("sideFromSliceOrientation"));
});

check("el nivel se toma del corte marcado y no del que analizó el modelo", () => {
  const draft = viewSource.slice(viewSource.indexOf("function buildRoiDraft"));
  assert.ok(draft.slice(0, 900).includes("levelForSlice"));
});

check("no se manda un pedido incompleto", () => {
  const submit = viewSource.slice(viewSource.indexOf("async function submitRoi"));
  // El guard sale antes si falta lado, nivel o input.
  assert.ok(submit.slice(0, 400).includes("!roiDraft.side"));
  assert.ok(submit.slice(0, 400).includes("!roiDraft.level"));
});

check("la respuesta pasa por el parseo estricto del contrato", () => {
  const submit = viewSource.slice(viewSource.indexOf("async function submitRoi"));
  assert.ok(submit.slice(0, 1600).includes("parseDegenerativeFindings"));
});

check("en modo demo no se ofrece pedir una clasificación", () => {
  assert.ok(viewSource.includes("roi={demoMode ? undefined :"));
});

check("el marcado solo se activa sobre el plano axial", () => {
  assert.ok(viewSource.includes('subarticularMode={subarticularMode && planeName === "axial"}'));
});

check("el estado vacío habla exclusivamente de clasificación subarticular", () => {
  assert.ok(panelSource.includes("Aún no se realizó una clasificación subarticular en esta sesión."));
  assert.ok(!panelSource.includes("Esta corrida no informa hallazgos degenerativos"));
});

check("el bloque conserva CTA y presenta el resultado como selección manual de investigación", () => {
  assert.ok(panelSource.includes("Clasificación subarticular"));
  assert.ok(panelSource.includes("Marcar receso subarticular"));
  assert.ok(panelSource.includes("Nueva selección"));
  assert.ok(panelSource.includes("Selección manual · Resultado de investigación"));
});

console.log(`subarticular-roi: ${passed} passed`);
