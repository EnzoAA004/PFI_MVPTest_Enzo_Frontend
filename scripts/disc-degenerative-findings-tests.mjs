import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * Hallazgos degenerativos discales (P10.7).
 *
 * Dos cosas se protegen acá.
 *
 * Que **no se muestre** un hallazgo que el contrato no sostiene: una probabilidad que no
 * suma, o una etiqueta que no es la clase más probable, al lado de una imagen del paciente
 * se lee con la misma autoridad que una correcta.
 *
 * Y que la **calidad de la tarea** viaje con el hallazgo. El modelo va de F1 0,846 en
 * abombamiento a 0,125 en espondilolistesis; una barra de probabilidad no comunica esa
 * diferencia, así que el deploymentStatus decide cómo se presenta y sin él no se muestra.
 */
function load(path, exportNames) {
  const source = fs.readFileSync(path, "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}\n${exportNames.map((n) => `exports.${n} = ${n};`).join("\n")}`, sandbox);
  return sandbox.exports;
}

const parser = load("src/features/reading/discDegenerativeFindings.ts", [
  "parseDiscDegenerativeFindings", "parseDiscFinding", "parseDiscProbabilities",
  "sortDiscFindings", "groupDiscFindingsByLevel", "labelsFor", "SCHEMA_VERSION",
]);
const display = load("src/features/reading/discFindingDisplay.ts", [
  "DISC_FINDING_LABELS", "DEPLOYMENT_LABELS", "DEPLOYMENT_NOTES", "startsCollapsed",
  "DEPLOYMENT_ORDER", "DISC_FINDINGS_NOTICE",
]);

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

/*
 * Los arrays que devuelve el codigo del sandbox pertenecen a otro realm, asi que
 * deepStrictEqual los ve distintos aunque tengan el mismo contenido. Se copian al realm
 * de este archivo antes de comparar.
 */
const sameList = (actual, expected) => assert.deepEqual([...actual], expected);

/** El ejemplo del handoff §6, tal cual. */
const finding = (overrides = {}) => ({
  findingId: "opaque-id",
  findingType: "disc_bulging",
  anatomy: { level: "L4-L5", side: null },
  classification: { kind: "binary", label: "present", probabilities: { absent: 0.12, present: 0.88 } },
  evidence: {
    deploymentStatus: "supported_internal",
    evaluationDataset: "SPIDER_internal_test",
    externalValidationAvailable: false,
  },
  localization: {
    source: "segmentation_derived_disc_level",
    researchOnly: true,
    automaticAnatomicalLocalizationValidated: false,
  },
  model: { modelId: "spider_degenerative_multitask_sagittal_t1_t2_2p5d", modelSha256: "16eccff3" },
  review: { required: true, status: "pending" },
  notClinicalDiagnosis: true,
  ...overrides,
});

const envelope = (findings) => ({ schemaVersion: parser.SCHEMA_VERSION, findings });

// --- el caso del handoff -----------------------------------------------------------

check("el ejemplo del contrato se parsea entero", () => {
  const parsed = parser.parseDiscFinding(finding());
  assert.equal(parsed.findingId, "opaque-id");
  assert.equal(parsed.findingType, "disc_bulging");
  assert.equal(parsed.level, "L4-L5");
  assert.equal(parsed.label, "present");
  assert.equal(parsed.probabilities.present, 0.88);
  assert.equal(parsed.deploymentStatus, "supported_internal");
  assert.equal(parsed.researchOnly, true);
  assert.equal(parsed.localizationValidated, false);
  assert.equal(parsed.reviewStatus, "pending");
});

check("las ocho tareas del modelo se aceptan", () => {
  const tipos = ["disc_bulging", "disc_narrowing", "upper_endplate_change", "lower_endplate_change",
    "pfirrmann_grade", "modic_change", "disc_herniation", "spondylolisthesis"];
  for (const findingType of tipos) {
    const labels = parser.labelsFor(findingType);
    const probabilities = Object.fromEntries(labels.map((l, i) => [l, i === 0 ? 1 : 0]));
    const parsed = parser.parseDiscFinding(finding({
      findingType, classification: { label: labels[0], probabilities },
    }));
    assert.ok(parsed, `${findingType} no se pudo parsear`);
  }
});

check("Pfirrmann usa sus cinco grados y Modic sus cuatro", () => {
  assert.deepEqual([...parser.labelsFor("pfirrmann_grade")], ["I", "II", "III", "IV", "V"]);
  assert.deepEqual([...parser.labelsFor("modic_change")], ["none", "I", "II", "III"]);
  assert.deepEqual([...parser.labelsFor("disc_bulging")], ["absent", "present"]);
});

// --- lo que NO se debe mostrar -----------------------------------------------------

check("una distribución que no suma 1 descarta el hallazgo", () => {
  assert.equal(parser.parseDiscFinding(finding({
    classification: { label: "present", probabilities: { absent: 0.5, present: 0.9 } },
  })), null);
});

check("faltando una clase se descarta, no se completa con cero", () => {
  assert.equal(parser.parseDiscFinding(finding({
    classification: { label: "III", probabilities: { I: 0.5, II: 0.2, III: 0.3 } },
    findingType: "pfirrmann_grade",
  })), null);
});

check("una clase de más significa que el contrato cambió, y se descarta", () => {
  assert.equal(parser.parseDiscFinding(finding({
    classification: { label: "present", probabilities: { absent: 0.1, present: 0.8, dudoso: 0.1 } },
  })), null);
});

check("la etiqueta tiene que ser la clase más probable", () => {
  // Se contradice a sí mismo: no hay forma de saber a cuál de las dos creerle.
  assert.equal(parser.parseDiscFinding(finding({
    classification: { label: "absent", probabilities: { absent: 0.12, present: 0.88 } },
  })), null);
});

check("una etiqueta fuera del catálogo de su tarea se descarta", () => {
  assert.equal(parser.parseDiscFinding(finding({
    classification: { label: "severe", probabilities: { absent: 0.12, present: 0.88 } },
  })), null);
  // "present" no es una etiqueta válida de Pfirrmann.
  assert.equal(parser.parseDiscFinding(finding({
    findingType: "pfirrmann_grade",
    classification: { label: "present", probabilities: { I: 1, II: 0, III: 0, IV: 0, V: 0 } },
  })), null);
});

check("un nivel fuera del catálogo lumbar se descarta", () => {
  assert.equal(parser.parseDiscFinding(finding({ anatomy: { level: "T12-L1" } })), null);
  assert.equal(parser.parseDiscFinding(finding({ anatomy: { level: "" } })), null);
});

check("una tarea que el modelo no clasifica se descarta", () => {
  assert.equal(parser.parseDiscFinding(finding({ findingType: "disc_desiccation" })), null);
});

check("sin findingId no se puede identificar el hallazgo", () => {
  assert.equal(parser.parseDiscFinding(finding({ findingId: "" })), null);
});

check("sin deploymentStatus no se muestra: no hay default honesto", () => {
  // Suponer el conservador escondería un resultado bueno; suponer el permisivo
  // presentaría como respaldado algo que acierta uno de cada cinco.
  assert.equal(parser.parseDiscFinding(finding({ evidence: { evaluationDataset: "x" } })), null);
  assert.equal(parser.parseDiscFinding(finding({
    evidence: { deploymentStatus: "produccion_clinica" },
  })), null);
});

// --- el sobre ----------------------------------------------------------------------

check("se exige la versión de esquema de P10.7", () => {
  assert.equal(parser.parseDiscDegenerativeFindings({ findings: [finding()] }).length, 0);
  // La de P10.6 no sirve: son contratos distintos con escalas incompatibles.
  assert.equal(parser.parseDiscDegenerativeFindings({
    schemaVersion: "pfi.degenerative-findings.v1", findings: [finding()],
  }).length, 0);
});

check("un hallazgo roto no arrastra a los buenos", () => {
  const parsed = parser.parseDiscDegenerativeFindings(envelope([
    finding({ findingId: "ok-1" }),
    finding({ findingId: "roto", classification: { label: "present", probabilities: { absent: 9, present: 9 } } }),
    finding({ findingId: "ok-2", anatomy: { level: "L5-S1" } }),
  ]));
  assert.equal(parsed.length, 2);
  sameList(parsed.map((f) => f.findingId), ["ok-1", "ok-2"]);
});

check("una respuesta sin hallazgos no rompe", () => {
  assert.equal(parser.parseDiscDegenerativeFindings(envelope([])).length, 0);
  assert.equal(parser.parseDiscDegenerativeFindings(null).length, 0);
  assert.equal(parser.parseDiscDegenerativeFindings({ schemaVersion: parser.SCHEMA_VERSION }).length, 0);
});

// --- alcance y revisión -------------------------------------------------------------

check("researchOnly ausente se toma como true", () => {
  const parsed = parser.parseDiscFinding(finding({ localization: { source: "x" } }));
  assert.equal(parsed.researchOnly, true);
});

check("la localización solo se declara validada si el contrato lo dice", () => {
  assert.equal(parser.parseDiscFinding(finding()).localizationValidated, false);
  assert.equal(parser.parseDiscFinding(finding({
    localization: { automaticAnatomicalLocalizationValidated: true },
  })).localizationValidated, true);
});

check("los cinco estados de revisión canónicos se conservan", () => {
  for (const status of ["pending", "accepted", "observed", "rejected", "edited"]) {
    assert.equal(parser.parseDiscFinding(finding({ review: { required: true, status } })).reviewStatus, status);
  }
  // Uno desconocido cae a pendiente: nunca a "aceptado".
  assert.equal(parser.parseDiscFinding(finding({ review: { status: "aprobado" } })).reviewStatus, "pending");
});

check("la revisión se exige salvo que el contrato la exima explícitamente", () => {
  assert.equal(parser.parseDiscFinding(finding({ review: {} })).reviewRequired, true);
});

// --- agrupación por nivel ------------------------------------------------------------

check("los hallazgos se agrupan por nivel en orden anatómico", () => {
  const parsed = parser.parseDiscDegenerativeFindings(envelope([
    finding({ findingId: "a", anatomy: { level: "L5-S1" } }),
    finding({ findingId: "b", anatomy: { level: "L1-L2" } }),
    finding({ findingId: "c", anatomy: { level: "L4-L5" } }),
  ]));
  const grupos = parser.groupDiscFindingsByLevel(parsed);
  sameList(grupos.map((g) => g.level), ["L1-L2", "L4-L5", "L5-S1"]);
});

check("dentro de un nivel las tareas van en orden estable", () => {
  const parsed = parser.parseDiscDegenerativeFindings(envelope([
    finding({ findingId: "a", findingType: "spondylolisthesis" }),
    finding({ findingId: "b", findingType: "disc_bulging" }),
    finding({ findingId: "c", findingType: "disc_narrowing" }),
  ]));
  const [grupo] = parser.groupDiscFindingsByLevel(parsed);
  sameList(grupo.findings.map((f) => f.findingType),
    ["disc_bulging", "disc_narrowing", "spondylolisthesis"]);
});

check("un nivel sin hallazgos no aparece como grupo vacío", () => {
  const parsed = parser.parseDiscDegenerativeFindings(envelope([finding()]));
  assert.equal(parser.groupDiscFindingsByLevel(parsed).length, 1);
});

// --- presentación ---------------------------------------------------------------------

check("las ocho tareas tienen traducción", () => {
  for (const tipo of ["disc_bulging", "disc_narrowing", "upper_endplate_change", "lower_endplate_change",
    "pfirrmann_grade", "modic_change", "disc_herniation", "spondylolisthesis"]) {
    assert.ok(display.DISC_FINDING_LABELS[tipo], `${tipo} sin traducción`);
    assert.ok(!display.DISC_FINDING_LABELS[tipo].includes("_"));
  }
});

check("la advertencia del grupo alcanza sola, porque el número sí se muestra", () => {
  // Se decidió mostrar las probabilidades en los tres estados: esconderlas también es
  // editorializar, y el grupo colapsado ya dijo qué clase de resultado es. Entonces la
  // nota tiene que cargar sola con la advertencia y no hablar de métricas, que no le
  // dicen nada a quien lee un estudio.
  const nota = display.DEPLOYMENT_NOTES.not_product_supported;
  assert.ok(nota.includes("minoría de los casos"));
  assert.ok(nota.includes("no la calidad del modelo"));
  assert.ok(!nota.includes("F1"));
});

check("las tareas de investigación vienen colapsadas, no ocultas", () => {
  assert.equal(display.startsCollapsed("not_product_supported"), true);
  assert.equal(display.startsCollapsed("experimental"), false);
  assert.equal(display.startsCollapsed("supported_internal"), false);
});

check("primero se presenta lo que se puede sostener", () => {
  sameList(display.DEPLOYMENT_ORDER,
    ["supported_internal", "experimental", "not_product_supported"]);
});

check("el aviso de alcance dice que no es diagnóstico", () => {
  assert.ok(display.DISC_FINDINGS_NOTICE.includes("revisión profesional"));
  assert.ok(display.DISC_FINDINGS_NOTICE.includes("No constituye un diagnóstico"));
});

console.log(`disc-degenerative-findings: ${passed} passed`);
