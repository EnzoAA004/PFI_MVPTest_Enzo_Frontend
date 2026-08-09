import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * Hallazgos degenerativos candidatos.
 *
 * Lo que más se protege acá es que **no se muestre** un hallazgo que el contrato no
 * sostiene. Una probabilidad que no suma, o una etiqueta fuera del catálogo, puesta al
 * lado de una imagen del paciente se lee con la misma autoridad que una correcta.
 *
 * Y la conversión de coordenadas: el modelo no localiza la anatomía, así que el punto
 * que se le manda decide qué se clasifica. Mandarlo en la base equivocada devuelve un
 * resultado de otra parte de la imagen, con la misma pinta de ser correcto.
 */
const source = fs.readFileSync("src/features/reading/degenerativeFindings.ts", "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/export /g, "");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, console };
vm.runInNewContext(
  `${js}
exports.parseDegenerativeFindings = parseDegenerativeFindings;
exports.parseFinding = parseFinding;
exports.parseProbabilities = parseProbabilities;
exports.sortFindings = sortFindings;
exports.viewerPointToImagePixels = viewerPointToImagePixels;`,
  sandbox,
);
const {
  parseDegenerativeFindings, parseFinding, parseProbabilities, sortFindings, viewerPointToImagePixels,
} = sandbox.exports;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

const finding = (overrides = {}) => ({
  findingId: "f-1",
  findingType: "subarticular_stenosis",
  anatomy: { level: "L4-L5", side: "left" },
  classification: {
    label: "normal_mild",
    probabilities: { normal_mild: 0.72, moderate: 0.2, severe: 0.08 },
  },
  evaluation: { status: "evaluated" },
  sourceSeries: { role: "axial_t2", position: 9 },
  localization: { source: "external_coordinate", researchOnly: true },
  model: { modelId: "rsna_subarticular_axial_t2_2p5d", modelSha256: "sha256" },
  review: { required: true, status: "pending" },
  notClinicalDiagnosis: true,
  ...overrides,
});

const envelope = (findings) => ({
  schemaVersion: "pfi.degenerative-findings.v1",
  findings,
});

// --- Envelope -------------------------------------------------------------

check("un envelope valido entrega sus hallazgos", () => {
  const parsed = parseDegenerativeFindings(envelope([finding()]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].level, "L4-L5");
  assert.equal(parsed[0].label, "normal_mild");
});

check("una version de esquema distinta no se interpreta", () => {
  // Otra version puede tener los mismos nombres de campo con otro significado.
  const otro = { ...envelope([finding()]), schemaVersion: "pfi.degenerative-findings.v2" };
  assert.equal(parseDegenerativeFindings(otro).length, 0);
});

check("sin version de esquema no se interpreta", () => {
  assert.equal(parseDegenerativeFindings({ findings: [finding()] }).length, 0);
  assert.equal(parseDegenerativeFindings(null).length, 0);
  assert.equal(parseDegenerativeFindings("degenerativeFindings").length, 0);
});

check("un hallazgo roto no arrastra a los sanos", () => {
  const parsed = parseDegenerativeFindings(envelope([
    finding({ findingId: "" }),
    finding({ findingId: "f-2" }),
  ]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].findingId, "f-2");
});

// --- Probabilidades -------------------------------------------------------

check("las tres clases forman una distribucion", () => {
  const dist = parseProbabilities({ normal_mild: 0.5, moderate: 0.3, severe: 0.2 });
  assert.equal(dist.normal_mild, 0.5);
  assert.equal(dist.moderate, 0.3);
  assert.equal(dist.severe, 0.2);
});

check("una distribucion que no suma se rechaza", () => {
  assert.equal(parseProbabilities({ normal_mild: 0.5, moderate: 0.3, severe: 0.9 }), null);
  assert.equal(parseProbabilities({ normal_mild: 0.1, moderate: 0.1, severe: 0.1 }), null);
});

check("una clase faltante se rechaza", () => {
  assert.equal(parseProbabilities({ normal_mild: 0.7, moderate: 0.3 }), null);
});

check("valores no finitos o fuera de rango se rechazan", () => {
  assert.equal(parseProbabilities({ normal_mild: NaN, moderate: 0.5, severe: 0.5 }), null);
  assert.equal(parseProbabilities({ normal_mild: -0.1, moderate: 0.6, severe: 0.5 }), null);
  assert.equal(parseProbabilities({ normal_mild: "0.7", moderate: 0.2, severe: 0.1 }), null);
});

check("un hallazgo con probabilidades rotas no se muestra", () => {
  const roto = finding({ classification: { label: "severe", probabilities: { normal_mild: 1, moderate: 1, severe: 1 } } });
  assert.equal(parseFinding(roto), null);
});

// --- Catalogos ------------------------------------------------------------

check("un nivel fuera del catalogo se rechaza", () => {
  assert.equal(parseFinding(finding({ anatomy: { level: "T12-L1", side: "left" } })), null);
});

check("un lado fuera del catalogo se rechaza", () => {
  assert.equal(parseFinding(finding({ anatomy: { level: "L4-L5", side: "bilateral" } })), null);
});

check("una etiqueta fuera del catalogo se rechaza", () => {
  const roto = finding({ classification: { label: "critica", probabilities: { normal_mild: 0.5, moderate: 0.3, severe: 0.2 } } });
  assert.equal(parseFinding(roto), null);
});

// --- Alcance y revision ---------------------------------------------------

check("researchOnly ausente se toma como verdadero", () => {
  // El default inseguro seria el permisivo: un hallazgo que no declara su alcance no
  // puede pasar por validado.
  const parsed = parseFinding(finding({ localization: { source: "external_coordinate" } }));
  assert.equal(parsed.researchOnly, true);
});

check("la revision se exige salvo que el contrato diga lo contrario", () => {
  assert.equal(parseFinding(finding({ review: {} })).reviewRequired, true);
  assert.equal(parseFinding(finding({ review: { required: false, status: "accepted" } })).reviewRequired, false);
});

check("un estado de revision desconocido cae en pendiente", () => {
  assert.equal(parseFinding(finding({ review: { required: true, status: "vistobueno" } })).reviewStatus, "pending");
});

check("la coordenada externa queda marcada", () => {
  assert.equal(parseFinding(finding()).externalCoordinate, true);
  const interno = finding({ localization: { source: "automatic_detector", researchOnly: false } });
  assert.equal(parseFinding(interno).externalCoordinate, false);
});

// --- Orden ----------------------------------------------------------------

check("se ordena por nivel y despues por lado", () => {
  const desordenados = [
    { level: "L5-S1", side: "right" },
    { level: "L4-L5", side: "right" },
    { level: "L4-L5", side: "left" },
    { level: "L1-L2", side: "left" },
  ];
  assert.equal(
    sortFindings(desordenados).map((item) => `${item.level}/${item.side}`).join(" "),
    "L1-L2/left L4-L5/left L4-L5/right L5-S1/right",
  );
});

// --- Coordenadas ----------------------------------------------------------

check("el punto del visor se convierte a pixeles de la imagen", () => {
  // El visor entrega 0..256 sin importar el tamaño real del corte.
  const a = viewerPointToImagePixels({ x: 128, y: 64 }, { width: 320, height: 320 });
  assert.equal(a.x, 160);
  assert.equal(a.y, 80);
  const origen = viewerPointToImagePixels({ x: 0, y: 0 }, { width: 512, height: 512 });
  assert.equal(origen.x, 0);
  assert.equal(origen.y, 0);
});

check("una serie no cuadrada usa cada eje por separado", () => {
  const p = viewerPointToImagePixels({ x: 128, y: 128 }, { width: 384, height: 256 });
  assert.equal(p.x, 192);
  assert.equal(p.y, 128);
});

check("sin las dimensiones del corte no se inventa la escala", () => {
  // Suponer 256x256 mandaria el punto a otra parte de la anatomia.
  assert.equal(viewerPointToImagePixels({ x: 128, y: 128 }, null), null);
  assert.equal(viewerPointToImagePixels({ x: 128, y: 128 }, { width: 0, height: 256 }), null);
  assert.equal(viewerPointToImagePixels({ x: 128, y: 128 }, { width: NaN, height: 256 }), null);
});

check("el punto no se sale de la imagen", () => {
  const dentro = viewerPointToImagePixels({ x: 256, y: 256 }, { width: 320, height: 320 });
  assert.ok(dentro.x <= 320 && dentro.y <= 320);
});

console.log(`degenerative-findings: ${passed} passed`);
