import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();

function loadMeasurementNormalizer() {
  const source = readFileSync(join(root, "src/studyApi.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/import\.meta\.env/g, "({})")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = {
    exports: {},
    console,
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}) }),
    authHeaders: () => ({ Authorization: "Bearer test-token" }),
    API_BASE_URL: "https://backend.example",
    ApiError: class ApiError extends Error { constructor(message, extra) { super(message); Object.assign(this, extra); } },
    ContractError: class ContractError extends Error { constructor(message, path) { super(message); this.path = path; } },
    priorityFromBackend: (value) => value ?? "media",
  };
  vm.runInNewContext(`${js}\nexports.normalizeMeasurement = normalizeMeasurement;`, sandbox);
  return sandbox.exports;
}

function loadClinicalDisplay() {
  const source = readFileSync(join(root, "src/clinicalDisplay.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.displayMeasurementLabel = displayMeasurementLabel;
exports.displayMeasurementLevel = displayMeasurementLevel;
exports.displayUnit = displayUnit;`, sandbox);
  return sandbox.exports;
}

const studyApi = loadMeasurementNormalizer();
const display = loadClinicalDisplay();

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

test("A medicion legacy con label se conserva tal cual", () => {
  const measurement = studyApi.normalizeMeasurement({ id: "m1", label: "Altura discal L4-L5", value: 14.1, unit: "mm" }, 0, "sagittal");
  assert.equal(measurement.label, "Altura discal L4-L5");
});

test("B medicion canonica con labelKey resuelve el label", () => {
  const measurement = studyApi.normalizeMeasurement({ id: "m2", labelKey: "canal width", value: 12, unit: "mm" }, 0, "sagittal");
  assert.equal(measurement.label, "canal width");
  assert.equal(display.displayMeasurementLabel(measurement.label), "Ancho del canal espinal");
});

test("C label tiene prioridad sobre labelKey cuando ambos existen", () => {
  const measurement = studyApi.normalizeMeasurement({ id: "m3", label: "Etiqueta explicita", labelKey: "canal width", value: 5, unit: "mm" }, 0, "sagittal");
  assert.equal(measurement.label, "Etiqueta explicita");
});

test("D fallback generico cuando faltan label y labelKey", () => {
  const measurement = studyApi.normalizeMeasurement({ id: "m4", value: 5, unit: "mm" }, 0, "sagittal");
  assert.equal(measurement.label, "Medición revisable");
});

test("E las nueve labelKey canonicas traducen al espanol", () => {
  const expected = {
    "vertebra_group area": "Área del grupo vertebral",
    "vertebra_group width": "Ancho del grupo vertebral",
    "vertebra_group height": "Altura del grupo vertebral",
    "canal area": "Área del canal espinal",
    "canal width": "Ancho del canal espinal",
    "canal height": "Altura del canal espinal",
    "disc_group area": "Área del grupo de discos intervertebrales",
    "disc_group width": "Ancho del grupo de discos intervertebrales",
    "disc_group height": "Altura del grupo de discos intervertebrales",
  };
  for (const [labelKey, spanish] of Object.entries(expected)) {
    const measurement = studyApi.normalizeMeasurement({ id: labelKey, labelKey, value: 1, unit: "mm" }, 0, "sagittal");
    assert.equal(display.displayMeasurementLabel(measurement.label), spanish, `labelKey ${labelKey}`);
  }
});

test("F labelKey desconocida se muestra legible y no como fallback generico", () => {
  const measurement = studyApi.normalizeMeasurement({ id: "m5", labelKey: "unknown_metric_key", value: 1, unit: "mm" }, 0, "sagittal");
  const shown = display.displayMeasurementLabel(measurement.label);
  assert.equal(shown, "unknown metric key");
  assert.notEqual(shown, "Medición revisable");
});

test("G level null continua como Nivel no informado", () => {
  assert.equal(display.displayMeasurementLevel(null), "Nivel no informado");
  assert.equal(display.displayMeasurementLevel(undefined), "Nivel no informado");
});

test("H unidad mm2 continua mostrandose como mm2 superindice", () => {
  const measurement = studyApi.normalizeMeasurement({ id: "m6", labelKey: "canal area", value: 100, unit: "mm2" }, 0, "sagittal");
  assert.equal(measurement.unit, "mm2");
  assert.equal(display.displayUnit(measurement.unit), "mm²");
});

test("I labelKey vacio o no string cae al fallback generico", () => {
  const emptyLabelKey = studyApi.normalizeMeasurement({ id: "m7", labelKey: "   ", value: 1, unit: "mm" }, 0, "sagittal");
  assert.equal(emptyLabelKey.label, "Medición revisable");
  const numericLabelKey = studyApi.normalizeMeasurement({ id: "m8", labelKey: 123, value: 1, unit: "mm" }, 0, "sagittal");
  assert.equal(numericLabelKey.label, "Medición revisable");
});

console.log(`P8-E3 labelKey compat tests passed: ${count}`);
