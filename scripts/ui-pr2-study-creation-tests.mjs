import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worklist = readFileSync("src/features/worklist/Worklist.tsx", "utf8");
const filters = readFileSync("src/features/worklist/studyFilters.ts", "utf8");
const drawer = readFileSync("src/features/worklist/NewAnalysisDrawer.tsx", "utf8");
const patientApi = readFileSync("src/patientApi.ts", "utf8");
const routes = readFileSync("src/routes.ts", "utf8");

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

test("Worklist elimina la columna Modelo y conserva las seis columnas operativas", () => {
  assert.doesNotMatch(worklist, /column="modelKey"|data-label="Modelo"|>Modelo</);
  for (const label of ["Caso", "Paciente", "Fecha", "Planos", "Revisión", "Prioridad"]) {
    assert.match(worklist, new RegExp(label));
  }
});

test("Worklist no presenta el modelo como criterio de búsqueda visible", () => {
  assert.match(worklist, /Buscar caso, paciente o descripción/);
  assert.doesNotMatch(filters, /displayModelKey|study\.modelKey/);
});

test("la referencia del estudio usa copy operativo", () => {
  assert.match(drawer, /Referencia interna del estudio \(opcional\)/);
  assert.match(drawer, /referencia breve para reconocer este estudio/);
  assert.doesNotMatch(drawer, /Referencia técnica legacy del estudio/);
});

test("el placeholder ya no parece un dataset técnico", () => {
  assert.match(drawer, /placeholder="EST-2026-001"/);
  assert.doesNotMatch(drawer, /placeholder="SPIDER-101"/);
});

/*
 * Los "01 / 02 / 03" en color de acento salieron en la pasada de densidad: no
 * eran pasos —nada impide escribir el ID de caso antes de elegir el paciente—
 * y el número pesaba más que el nombre de la sección. El intento del test no
 * cambia: el formulario tiene que seguir nombrando sus tres partes y decir en
 * una línea qué se hace ahí.
 */
test("el flujo explica paciente, estudio, imágenes y análisis", () => {
  assert.match(drawer, /Seleccioná el paciente, completá los datos del estudio, cargá las imágenes y ejecutá el análisis/);
  assert.match(drawer, /<h3 className="wl-section-title">Datos del estudio<\/h3>/);
  assert.match(drawer, /<h3 className="wl-section-title">Imágenes<\/h3>/);
  assert.doesNotMatch(drawer, /aria-hidden="true">0\d<\/span>/);
});

test("el análisis muestra progreso honesto sin porcentaje inventado", () => {
  assert.match(drawer, /aria-label="Progreso del análisis"/);
  assert.match(drawer, /Procesando imágenes/);
  assert.match(drawer, /Completando resultados/);
  assert.match(drawer, /Asociando al paciente/);
  assert.match(drawer, /El sistema no informa porcentajes/);
  assert.doesNotMatch(drawer, /progressPercent|setInterval/);
});

test("doble submit queda bloqueado de forma síncrona", () => {
  assert.match(drawer, /runInFlightRef\.current/);
  assert.match(drawer, /if \(!sagittalReady \|\| running \|\| runInFlightRef\.current\) return/);
  assert.match(drawer, /disabled=\{!patientReady \|\| !sagittalReady \|\| running\}/);
});

test("éxito completo abre automáticamente el Study asociado", () => {
  const successBlock = drawer.slice(drawer.indexOf("const nextProductState = await runProductExtensions(context)"), drawer.indexOf("// La corrida existe"));
  assert.match(successBlock, /association\.status === "associated"/);
  assert.match(successBlock, /openCompletedStudy\(context\.caseId\)/);
});

test("un error de análisis no navega y mantiene el contexto", () => {
  const runStart = drawer.indexOf("async function run()");
  const catchStart = drawer.indexOf("catch (error)", runStart);
  const errorBlock = drawer.slice(catchStart, drawer.indexOf("finally", catchStart));
  assert.match(errorBlock, /setMessage\(apiErrorMessage/);
  assert.match(errorBlock, /setAnalysisStage\("idle"\)/);
  assert.doesNotMatch(errorBlock, /onAnalysisReady|openCompletedStudy/);
});

test("retry de asociación conserva operación exclusiva y autoabre al resolver", () => {
  const retryBlock = drawer.slice(drawer.indexOf("async function retryPatientAssociation"), drawer.indexOf("async function run()"));
  assert.match(retryBlock, /attemptPatientAssociation\(persistedRun, selectedPatient\.id\)/);
  assert.doesNotMatch(retryBlock, /runMultiplanarAnalysis|createPatient/);
  assert.match(retryBlock, /openCompletedStudy\(persistedRun\.caseId\)/);
});

test("Patient API mantiene endpoints y payloads existentes", () => {
  assert.match(patientApi, /multiplanarRequest<unknown>\("\/api\/patients"/);
  assert.match(patientApi, /body: JSON\.stringify\(request\)/);
  assert.match(patientApi, /reason: "INITIAL_ASSIGNMENT"/);
});

test("Study Review conserva la ruta funcional por caseId", () => {
  assert.match(routes, /return `\$\{ROUTES\.study\}\/\$\{encodeURIComponent\(caseId\)\}`/);
  assert.match(routes, /study: "\/estudio"/);
});

console.log(`UI-PR2 study creation tests: ${count} passed`);
