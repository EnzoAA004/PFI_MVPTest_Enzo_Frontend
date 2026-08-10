import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, exportNames) {
  const source = readFileSync(path, "utf8").replace(/^import .*$/gm, "").replace(/export /g, "");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}\n${exportNames.map((name) => `exports.${name} = ${name};`).join("\n")}`, sandbox);
  return sandbox.exports;
}

const parser = load("src/features/reading/discDegenerativeFindings.ts", [
  "DiscDegenerativeContractError",
  "parseDiscDegenerativeFindings",
  "parseDiscDegenerativeFindingsResponse",
  "parsePersistedDiscDegenerativeFindings",
  "parseDiscFinding",
  "sortDiscFindings",
  "groupDiscFindingsByLevel",
  "labelsFor",
  "SCHEMA_VERSION",
]);
const display = load("src/features/reading/discFindingDisplay.ts", [
  "DISC_FINDING_LABELS",
  "DEPLOYMENT_LABELS",
  "DEPLOYMENT_NOTES",
  "startsCollapsed",
  "DEPLOYMENT_ORDER",
  "DISC_FINDINGS_NOTICE",
]);

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}
const sameList = (actual, expected) => assert.deepEqual([...actual], expected);
const hash = "16eccff327e6794b127fe372ecd03ea619a0f69d939b84ae1aa2e904191c6293";

const finding = (overrides = {}) => ({
  findingId: "opaque-id",
  findingType: "disc_bulging",
  anatomy: { level: "L4-L5" },
  classification: { kind: "binary", label: "present" },
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
  model: { modelId: "spider_degenerative_multitask_sagittal_t1_t2_2p5d", modelSha256: hash },
  review: { required: true, status: "pending" },
  notClinicalDiagnosis: true,
  ...overrides,
});

const disc = (findings = [finding()]) => ({ schemaVersion: parser.SCHEMA_VERSION, findings });
const live = (overrides = {}) => ({
  discDegenerativeFindings: disc(),
  humanReviewRequired: true,
  notClinicalDiagnosis: true,
  autonomousDiagnosis: false,
  persistence: {
    status: "persisted_immutable",
    multiplanarRunId: "multi-1",
    reviewStoredSeparately: true,
  },
  ...overrides,
});
const snapshot = (overrides = {}) => ({
  discDegenerativeFindings: disc(),
  discDegenerativeGovernance: {
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    autonomousDiagnosis: false,
    predictionImmutable: true,
    reviewStoredSeparately: true,
  },
  ...overrides,
});

check("la proyección pública se parsea sin probabilities", () => {
  const parsed = parser.parseDiscFinding(finding());
  assert.equal(parsed.label, "present");
  assert.equal(Object.hasOwn(parsed, "probabilities"), false);
  assert.equal(parsed.deploymentStatus, "supported_internal");
  assert.equal(parsed.localizationValidated, false);
  assert.equal(parsed.modelSha256, hash);
});

check("las ocho tareas aceptan exclusivamente su label público", () => {
  const types = ["disc_bulging", "disc_narrowing", "upper_endplate_change", "lower_endplate_change",
    "pfirrmann_grade", "modic_change", "disc_herniation", "spondylolisthesis"];
  for (const findingType of types) {
    const categorical = findingType === "pfirrmann_grade" || findingType === "modic_change";
    const parsed = parser.parseDiscFinding(finding({
      findingType,
      classification: { kind: categorical ? "categorical" : "binary", label: parser.labelsFor(findingType)[0] },
    }));
    assert.ok(parsed, `${findingType} no se pudo parsear`);
  }
});

check("Pfirrmann, Modic y binarias conservan catálogos separados", () => {
  sameList(parser.labelsFor("pfirrmann_grade"), ["I", "II", "III", "IV", "V"]);
  sameList(parser.labelsFor("modic_change"), ["none", "I", "II", "III"]);
  sameList(parser.labelsFor("disc_bulging"), ["absent", "present"]);
});

check("si probabilities reaparece se rechaza el finding completo", () => {
  assert.equal(parser.parseDiscFinding(finding({
    classification: { kind: "binary", label: "present", probabilities: { absent: 0.1, present: 0.9 } },
  })), null);
});

check("kind incompatible con la tarea viola el contrato", () => {
  assert.equal(parser.parseDiscFinding(finding({ classification: { kind: "categorical", label: "present" } })), null);
});

check("label fuera del catálogo viola el contrato", () => {
  assert.equal(parser.parseDiscFinding(finding({ classification: { kind: "binary", label: "severe" } })), null);
});

check("nivel fuera del catálogo viola el contrato", () => {
  assert.equal(parser.parseDiscFinding(finding({ anatomy: { level: "T12-L1" } })), null);
});

check("findingType desconocido viola el contrato", () => {
  assert.equal(parser.parseDiscFinding(finding({ findingType: "disc_desiccation" })), null);
});

check("findingId es obligatorio", () => {
  assert.equal(parser.parseDiscFinding(finding({ findingId: "" })), null);
});

check("deploymentStatus no tiene default permisivo", () => {
  assert.equal(parser.parseDiscFinding(finding({ evidence: { externalValidationAvailable: false } })), null);
});

check("localización exige origen derivado y no validación clínica", () => {
  assert.equal(parser.parseDiscFinding(finding({ localization: { source: "manual", researchOnly: true, automaticAnatomicalLocalizationValidated: false } })), null);
  assert.equal(parser.parseDiscFinding(finding({ localization: { source: "segmentation_derived_disc_level", researchOnly: true, automaticAnatomicalLocalizationValidated: true } })), null);
});

check("modelo requiere id y hash completo", () => {
  assert.equal(parser.parseDiscFinding(finding({ model: { modelId: "model", modelSha256: "16eccff3" } })), null);
});

check("review.required debe ser true y queda separado", () => {
  assert.equal(parser.parseDiscFinding(finding({ review: { required: false, status: "pending" } })), null);
  assert.equal(parser.parseDiscFinding(finding({ review: { required: true, status: "accepted" } })), null);
});

check("cada finding exige notClinicalDiagnosis true", () => {
  assert.equal(parser.parseDiscFinding(finding({ notClinicalDiagnosis: false })), null);
});

check("schemaVersion incorrecto produce contract violation", () => {
  assert.throws(() => parser.parseDiscDegenerativeFindings({ schemaVersion: "otro", findings: [finding()] }), /schemaVersion/);
});

check("un finding roto invalida todo el sobre; no hay resultados parciales", () => {
  assert.throws(() => parser.parseDiscDegenerativeFindings(disc([
    finding({ findingId: "ok" }),
    finding({ findingId: "broken", classification: { kind: "binary", label: "severe" } }),
  ])), /incompletos/);
});

check("findings vacío es una violación", () => {
  assert.throws(() => parser.parseDiscDegenerativeFindings(disc([])), /vacío/);
});

check("respuesta live exige los tres flags de seguridad", () => {
  for (const field of ["humanReviewRequired", "notClinicalDiagnosis", "autonomousDiagnosis"]) {
    assert.throws(() => parser.parseDiscDegenerativeFindingsResponse(live({ [field]: undefined }), "multi-1"), /flags/);
  }
});

check("respuesta live confirma la corrida persistida", () => {
  assert.equal(parser.parseDiscDegenerativeFindingsResponse(live(), "multi-1").length, 1);
  assert.throws(() => parser.parseDiscDegenerativeFindingsResponse(live(), "multi-other"), /persistencia/);
});

check("snapshot durable exige governance y review separado", () => {
  assert.equal(parser.parsePersistedDiscDegenerativeFindings(snapshot()).length, 1);
  assert.throws(() => parser.parsePersistedDiscDegenerativeFindings({ discDegenerativeFindings: disc() }), /governance/);
});

check("snapshot durable no permite autonomousDiagnosis", () => {
  assert.throws(() => parser.parsePersistedDiscDegenerativeFindings(snapshot({
    discDegenerativeGovernance: {
      humanReviewRequired: true,
      notClinicalDiagnosis: true,
      autonomousDiagnosis: true,
      predictionImmutable: true,
      reviewStoredSeparately: true,
    },
  })), /flags/);
});

check("agrupa niveles en orden anatómico", () => {
  const parsed = parser.parseDiscDegenerativeFindings(disc([
    finding({ findingId: "a", anatomy: { level: "L5-S1" } }),
    finding({ findingId: "b", anatomy: { level: "L1-L2" } }),
    finding({ findingId: "c", anatomy: { level: "L4-L5" } }),
  ]));
  sameList(parser.groupDiscFindingsByLevel(parsed).map((group) => group.level), ["L1-L2", "L4-L5", "L5-S1"]);
});

check("ordena tareas de forma estable dentro de cada nivel", () => {
  const parsed = parser.parseDiscDegenerativeFindings(disc([
    finding({ findingId: "a", findingType: "spondylolisthesis" }),
    finding({ findingId: "b", findingType: "disc_bulging" }),
    finding({ findingId: "c", findingType: "disc_narrowing" }),
  ]));
  sameList(parser.groupDiscFindingsByLevel(parsed)[0].findings.map((item) => item.findingType),
    ["disc_bulging", "disc_narrowing", "spondylolisthesis"]);
});

check("las ocho tareas tienen etiqueta de presentación", () => {
  for (const type of ["disc_bulging", "disc_narrowing", "upper_endplate_change", "lower_endplate_change",
    "pfirrmann_grade", "modic_change", "disc_herniation", "spondylolisthesis"]) {
    assert.ok(display.DISC_FINDING_LABELS[type]);
  }
});

check("deploymentStatus distingue validación, experimental y no soportado", () => {
  assert.equal(display.DEPLOYMENT_LABELS.supported_internal, "Validación interna");
  assert.equal(display.DEPLOYMENT_LABELS.experimental, "Experimental");
  assert.equal(display.DEPLOYMENT_LABELS.not_product_supported, "No soportado para producto");
});

check("not_product_supported queda plegado y separado", () => {
  assert.equal(display.startsCollapsed("not_product_supported"), true);
  assert.equal(display.startsCollapsed("experimental"), false);
});

check("primero se presenta lo respaldado", () => {
  sameList(display.DEPLOYMENT_ORDER, ["supported_internal", "experimental", "not_product_supported"]);
});

check("el aviso exige revisión y niega diagnóstico autónomo", () => {
  assert.match(display.DISC_FINDINGS_NOTICE, /revisión profesional/);
  assert.match(display.DISC_FINDINGS_NOTICE, /No constituye un diagnóstico clínico autónomo/);
});

check("el panel P10.7 no contiene probabilities, confidence ni logits", () => {
  const panel = readFileSync("src/features/reading/DiscDegenerativeFindingsPanel.tsx", "utf8");
  assert.doesNotMatch(panel, /probabilit|confidence|logit/i);
  assert.match(panel, /finding\.label/);
});

console.log(`disc-degenerative-findings: ${passed} passed`);
