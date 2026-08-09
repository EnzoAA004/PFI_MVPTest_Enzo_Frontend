import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * Las letras de orientación de los bordes del visor.
 *
 * Lo que más se protege acá es el caso que da vergüenza equivocar: en una axial neutra la
 * izquierda de la imagen es la DERECHA del paciente. Una letra invertida se lee con la
 * misma autoridad que una correcta y manda a mirar el receso del otro lado.
 */
const source = fs.readFileSync("src/features/reading/orientationMarkers.ts", "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/export /g, "");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, console };
vm.runInNewContext(
  `${js}
exports.orientationLabels = orientationLabels;
exports.spokenOrientation = spokenOrientation;`,
  sandbox,
);
const { orientationLabels, spokenOrientation } = sandbox.exports;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

// DICOM 0020|0037. LPS: +x izquierda del paciente, +y posterior, +z craneal.
const AXIAL = { row: [1, 0, 0], col: [0, 1, 0] };
const SAGITTAL = { row: [0, 1, 0], col: [0, 0, -1] };
const CORONAL = { row: [1, 0, 0], col: [0, 0, -1] };

check("en una axial neutra la izquierda de la imagen es la derecha del paciente", () => {
  const labels = orientationLabels(AXIAL.row, AXIAL.col);
  // Este es el test que justifica el módulo entero.
  assert.equal(labels.left, "R");
  assert.equal(labels.right, "L");
});

check("en una axial neutra arriba es anterior y abajo posterior", () => {
  const labels = orientationLabels(AXIAL.row, AXIAL.col);
  assert.equal(labels.top, "A");
  assert.equal(labels.bottom, "P");
});

check("una sagital muestra anterior/posterior en horizontal y craneal/caudal en vertical", () => {
  const labels = orientationLabels(SAGITTAL.row, SAGITTAL.col);
  assert.equal(labels.left, "A");
  assert.equal(labels.right, "P");
  assert.equal(labels.top, "H");
  assert.equal(labels.bottom, "F");
});

check("una coronal muestra derecha/izquierda en horizontal y craneal/caudal en vertical", () => {
  const labels = orientationLabels(CORONAL.row, CORONAL.col);
  assert.equal(labels.left, "R");
  assert.equal(labels.right, "L");
  assert.equal(labels.top, "H");
  assert.equal(labels.bottom, "F");
});

check("una serie con la fila invertida da las letras opuestas", () => {
  const normal = orientationLabels([1, 0, 0], [0, 1, 0]);
  const flipped = orientationLabels([-1, 0, 0], [0, 1, 0]);
  assert.equal(normal.left, "R");
  assert.equal(flipped.left, "L");
  assert.notEqual(normal.right, flipped.right);
});

check("los bordes opuestos nunca coinciden", () => {
  for (const { row, col } of [AXIAL, SAGITTAL, CORONAL]) {
    const labels = orientationLabels(row, col);
    assert.notEqual(labels.left, labels.right);
    assert.notEqual(labels.top, labels.bottom);
  }
});

check("un corte oblicuo toma el eje dominante", () => {
  // Angulado 23 grados, como los bloques axiales del estudio de referencia.
  const labels = orientationLabels([0.999, 0.04, 0], [0, 0.92, 0.39]);
  assert.equal(labels.right, "L");
  assert.equal(labels.bottom, "P");
});

// --- lo que NO se debe inventar ---------------------------------------------------

check("sin orientación no se muestra ninguna letra", () => {
  assert.equal(orientationLabels(null, [0, 1, 0]), null);
  assert.equal(orientationLabels([1, 0, 0], null), null);
  assert.equal(orientationLabels(undefined, undefined), null);
});

check("una orientación con valores no finitos no produce letras", () => {
  assert.equal(orientationLabels([NaN, 0, 0], [0, 1, 0]), null);
  assert.equal(orientationLabels([1, 0, 0], [0, Infinity, 0]), null);
});

check("un vector nulo no apunta a ningún lado", () => {
  assert.equal(orientationLabels([0, 0, 0], [0, 1, 0]), null);
});

check("un vector de largo incorrecto se descarta", () => {
  assert.equal(orientationLabels([1, 0], [0, 1, 0]), null);
});

// --- accesibilidad -----------------------------------------------------------------

check("la orientación se puede leer en voz alta sin ambigüedad", () => {
  const spoken = spokenOrientation(orientationLabels(AXIAL.row, AXIAL.col));
  // "R" a secas no dice nada por altavoz.
  assert.ok(spoken.includes("derecha del paciente"));
  assert.ok(spoken.includes("izquierda del paciente"));
  assert.ok(!spoken.includes("undefined"));
});

// --- coherencia con la derivación de lado del ROI ------------------------------------

check("las letras coinciden con el lado que deriva el ROI subarticular", () => {
  // Dos módulos distintos leen el mismo vector; si divergen, la pantalla se contradice
  // a sí misma: una letra en el borde y otro lado en el panel.
  const roiSource = fs.readFileSync("src/features/reading/subarticularRoi.ts", "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  const roiJs = ts.transpileModule(roiSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const roiBox = { exports: {}, console };
  vm.runInNewContext(`${roiJs}\nexports.sideFromSliceOrientation = sideFromSliceOrientation;`, roiBox);

  const width = 320;
  // Un punto a la derecha de la imagen, en axial neutra.
  const side = roiBox.exports.sideFromSliceOrientation({ x: 240, y: 100 }, width, AXIAL.row);
  const labels = orientationLabels(AXIAL.row, AXIAL.col);
  assert.equal(side, "left");
  assert.equal(labels.right, "L");

  // Y con la fila invertida, los dos se dan vuelta juntos.
  const flippedSide = roiBox.exports.sideFromSliceOrientation({ x: 240, y: 100 }, width, [-1, 0, 0]);
  const flippedLabels = orientationLabels([-1, 0, 0], AXIAL.col);
  assert.equal(flippedSide, "right");
  assert.equal(flippedLabels.right, "R");
});

console.log(`orientation-markers: ${passed} passed`);
